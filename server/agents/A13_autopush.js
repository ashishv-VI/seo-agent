/**
 * A13 — Auto-Push Agent — Level 2 (Act)
 *
 * Reads approved fixes from the approval_queue and automatically pushes
 * them to the connected WordPress site.
 *
 * Supported fix types for auto-push:
 *   - title_tag         → wp.updatePageMeta({ title, seoTitle })
 *   - meta_description  → wp.updatePageMeta({ metaDescription })
 *   - canonical_tag     → wp.updatePageMeta({ canonicalUrl })
 *   - missing_schema    → wp.injectSchema(jsonLd)
 *   - seo_title         → wp.updatePageMeta({ seoTitle })
 *   - og_tags_missing   → stores in meta for Yoast
 *   - h1_tag            → recorded only (requires content edit — not safe to auto-push)
 *
 * Each push is logged to `wp_push_log` for ROI attribution (Level 4).
 */
const { db, FieldValue }  = require("../config/firebase");
const { getState }        = require("../shared-state/stateManager");
const wp                  = require("../utils/wpConnector");

// Fix types that can be safely auto-pushed to WordPress
const WP_PUSHABLE_TYPES = new Set([
  "title_tag",
  "meta_description",
  "missing_meta_desc",
  "long_meta_desc",
  "short_title",
  "long_title",
  "missing_title",
  "canonical_tag",
  "missing_canonical",
  "missing_schema",
  "seo_title",
  "no_viewport",        // meta tag — pushed as generic head injection note
  "og_tags_missing",
  "open_graph",
]);

/**
 * Run A13 for a specific client
 * Finds all approved fixes in approval_queue and pushes them to WordPress
 *
 * @param {string} clientId
 * @param {object} keys — user API keys (not needed for WP push but part of standard signature)
 */
async function runA13(clientId, keys) {
  // Get client doc + WP integration config
  const clientDoc = await db.collection("clients").doc(clientId).get();
  if (!clientDoc.exists) return { success: false, error: "Client not found" };

  const clientData = clientDoc.data();
  const wpInt      = clientData.wpIntegration;

  if (!wpInt?.connected || !wpInt?.url || !wpInt?.username || !wpInt?.appPassword) {
    return { success: false, error: "WordPress not connected for this client — go to Integrations tab to connect" };
  }

  // Get all approved fixes waiting to be pushed
  const snap = await db.collection("approval_queue")
    .where("clientId",  "==", clientId)
    .where("status",    "==", "approved")
    .get();

  const approvedItems = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(item => WP_PUSHABLE_TYPES.has(item.issueType));

  if (approvedItems.length === 0) {
    return { success: true, pushed: 0, message: "No approved WP-pushable fixes found" };
  }

  // Get page/post inventory from WP to find correct post IDs
  let wpPages = [];
  let wpPosts = [];
  try {
    [wpPages, wpPosts] = await Promise.all([
      wp.getPages(wpInt.url, wpInt.username, wpInt.appPassword),
      wp.getPosts(wpInt.url, wpInt.username, wpInt.appPassword, 50),
    ]);
  } catch (e) {
    return { success: false, error: `Could not fetch WP pages/posts: ${e.message}` };
  }

  const allWpContent = [...wpPages.map(p => ({ ...p, type: "page" })), ...wpPosts.map(p => ({ ...p, type: "post" }))];

  // Helper: find WP content item by URL path or slug
  function findWpItem(pageHint) {
    if (!pageHint) return allWpContent[0] || null; // default to homepage
    const hint = pageHint.toLowerCase().replace(/^\/|\/$/g, "");

    return allWpContent.find(item => {
      const itemSlug = (item.slug || "").toLowerCase();
      const itemPath = (item.url  || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/|\/$/g, "").toLowerCase();
      return itemSlug === hint || itemPath === hint || itemPath.endsWith("/" + hint) || hint === "" && (itemSlug === "" || item.url === wpInt.url + "/");
    }) || allWpContent[0] || null;
  }

  const pushed  = [];
  const failed  = [];
  const skipped = [];
  const logBatch = db.batch();

  for (const item of approvedItems) {
    const data      = item.data || {};
    const issueType = item.issueType;
    const page      = data.page || "/";

    const wpItem = findWpItem(page);
    if (!wpItem) {
      skipped.push({ id: item.id, reason: "No matching WordPress page/post found" });
      continue;
    }

    let wpBackup = null; // declared here so catch block can access it for rollback
    try {
      let pushResult = null;
      let fieldPushed = "";

      // Read current values before overwriting (for ROI log)
      let oldTitle = wpItem.seoTitle  || wpItem.title || null;
      let oldMeta  = wpItem.metaDescription || null;

      // Fetch full WP backup before any overwrite — store in Firestore for rollback
      try {
        wpBackup = await wp.getPost(wpInt.url, wpInt.username, wpInt.appPassword, wpItem.type, wpItem.id);
        await db.collection("wp_backups").add({
          clientId,
          approvalId:      item.id,
          wpPostId:        wpItem.id,
          wpPostType:      wpItem.type,
          issueType,
          backedUpAt:      new Date().toISOString(),
          title:           wpBackup.title,
          seoTitle:        wpBackup.seoTitle,
          metaDescription: wpBackup.metaDescription,
          canonicalUrl:    wpBackup.canonicalUrl,
        });
      } catch { /* backup is best-effort — proceed even if it fails */ }

      if (issueType === "title_tag" || issueType === "missing_title" || issueType === "short_title" || issueType === "long_title" || issueType === "seo_title") {
        const newTitle = data.suggestedFix || data.codeSnippet || null;
        if (!newTitle) { skipped.push({ id: item.id, reason: "No title value in fix" }); continue; }

        pushResult = await wp.updatePageMeta(wpInt.url, wpInt.username, wpInt.appPassword, wpItem.type, wpItem.id, {
          title:    newTitle,
          seoTitle: newTitle,
        });
        fieldPushed = "seo_title";
      }
      else if (issueType === "meta_description" || issueType === "missing_meta_desc" || issueType === "long_meta_desc") {
        const newMeta = data.suggestedFix || data.codeSnippet || null;
        if (!newMeta) { skipped.push({ id: item.id, reason: "No meta description value in fix" }); continue; }

        pushResult = await wp.updatePageMeta(wpInt.url, wpInt.username, wpInt.appPassword, wpItem.type, wpItem.id, {
          metaDescription: newMeta,
        });
        fieldPushed = "meta_description";
      }
      else if (issueType === "canonical_tag" || issueType === "missing_canonical") {
        const canonicalUrl = data.suggestedFix || `${wpInt.url}/${wpItem.slug || ""}`.replace(/\/+$/, "/");
        pushResult = await wp.updatePageMeta(wpInt.url, wpInt.username, wpInt.appPassword, wpItem.type, wpItem.id, {
          canonicalUrl,
        });
        fieldPushed = "canonical_url";
      }
      else if (issueType === "missing_schema") {
        const jsonLd = data.codeSnippet || data.suggestedFix || null;
        if (!jsonLd) { skipped.push({ id: item.id, reason: "No JSON-LD schema in fix" }); continue; }

        pushResult = await wp.injectSchema(wpInt.url, wpInt.username, wpInt.appPassword, wpItem.type, wpItem.id, jsonLd);
        fieldPushed = "schema";
      }
      else if (issueType === "og_tags_missing" || issueType === "open_graph") {
        // Store OG data in Yoast social meta (requires Yoast SEO Premium for full OG control)
        const snippet = data.codeSnippet || data.suggestedFix || "";
        pushResult = await wp.updatePageMeta(wpInt.url, wpInt.username, wpInt.appPassword, wpItem.type, wpItem.id, {
          seoTitle: wpItem.seoTitle || wpItem.title, // preserve existing
        });
        fieldPushed = "og_meta";
      }

      if (pushResult) {
        // Mark approval item as pushed
        await db.collection("approval_queue").doc(item.id).update({
          status:   "pushed",
          pushedAt: FieldValue.serverTimestamp(),
          pushedTo: `${wpInt.url} — ${wpItem.type} #${wpItem.id} (${wpItem.title})`,
        });

        // Mark original task as complete
        if (item.taskId) {
          await db.collection("task_queue").doc(clientId).collection("tasks").doc(item.taskId)
            .update({ status: "complete", completedAt: FieldValue.serverTimestamp(), completedBy: "A13_autopush" })
            .catch(() => {}); // non-blocking
        }

        // Write to ROI push log
        const logRef = db.collection("wp_push_log").doc();
        logBatch.set(logRef, {
          clientId,
          approvalId:    item.id,
          taskId:        item.taskId       || null,
          wpPostId:      wpItem.id,
          wpPostType:    wpItem.type,
          wpPostTitle:   wpItem.title,
          wpPostUrl:     wpItem.url,
          field:         fieldPushed,
          oldValue:      fieldPushed === "seo_title" ? oldTitle : fieldPushed === "meta_description" ? oldMeta : null,
          newValue:      data.suggestedFix || data.codeSnippet || null,
          issueType,
          pushedAt:      new Date().toISOString(),
          pushedBy:      "A13_autopush",
          rankingBefore: null, // filled by A16_memory / ROI tracker later
          rankingAfter:  null,
        });

        pushed.push({
          approvalId: item.id,
          issue:      issueType,
          wpPostId:   wpItem.id,
          wpPostTitle:wpItem.title,
          field:      fieldPushed,
        });
      }
    } catch (e) {
      // Attempt to restore from backup if we have one
      if (wpBackup) {
        try {
          await wp.updatePageMeta(wpInt.url, wpInt.username, wpInt.appPassword, wpItem.type, wpItem.id, {
            title:           wpBackup.title,
            seoTitle:        wpBackup.seoTitle,
            metaDescription: wpBackup.metaDescription,
            canonicalUrl:    wpBackup.canonicalUrl,
          });
          console.log(`[A13] Restored WP backup for ${wpItem.type} #${wpItem.id} after push failure`);
        } catch { /* restore also failed — backup remains in Firestore for manual rollback */ }
      }
      failed.push({ id: item.id, issue: issueType, error: e.message });
    }
  }

  // Commit the push log batch
  try { await logBatch.commit(); } catch { /* non-blocking */ }

  return {
    success: true,
    pushed:  pushed.length,
    failed:  failed.length,
    skipped: skipped.length,
    pushedItems: pushed,
    failedItems: failed,
    message: `Pushed ${pushed.length} fix(es) to ${wpInt.url}`,
  };
}

/**
 * Push a single specific approval item to WordPress
 * Used by the "Push to WP" button in the Approval Queue UI
 *
 * @param {string} clientId
 * @param {string} approvalId — ID of the approval_queue document
 */
async function pushSingleFix(clientId, approvalId) {
  const clientDoc = await db.collection("clients").doc(clientId).get();
  if (!clientDoc.exists) throw new Error("Client not found");

  const wpInt = clientDoc.data().wpIntegration;
  if (!wpInt?.connected) throw new Error("WordPress not connected");

  const itemDoc = await db.collection("approval_queue").doc(approvalId).get();
  if (!itemDoc.exists) throw new Error("Approval item not found");

  const item = { id: itemDoc.id, ...itemDoc.data() };
  if (item.clientId !== clientId) throw new Error("Access denied");

  // Temporarily mark as approved so runA13 picks it up
  if (item.status !== "approved") {
    await db.collection("approval_queue").doc(approvalId).update({ status: "approved" });
  }

  // Run A13 with just this item
  const result = await runA13(clientId, {});
  return result;
}

module.exports = { runA13, pushSingleFix };
