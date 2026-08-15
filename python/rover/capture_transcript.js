/* Rover Transcript Capture — full-page capture of a chat export.
 *
 * Fixes the premature-capture defect documented in the harvest-pipeline
 * debug report: the browser's virtualized conversation list renders only the
 * visible viewport, so a naive DOM dump saves a mid-conversation slice (the
 * file's first message ends up being an assistant reply instead of the
 * opening user turn).
 *
 * This snippet:
 *   1. Waits for `document.readyState === "complete"`.
 *   2. Scrolls through the whole conversation (to the bottom, then back to
 *      the top) so the virtualized list materializes every message.
 *   3. Serializes the full DOM (`document.documentElement.outerHTML`) and
 *      downloads it as `<page title>.html`.
 *
 * It also logs a diagnostic line — and a WARNING if the captured first
 * message is not a user turn (i.e. the capture still starts mid-conversation).
 *
 * Usage (DevTools console):
 *   Paste this entire file into the console and press Enter.
 *
 * Usage (bookmarklet):
 *   Minify to one line and prefix with `javascript:` — see
 *   capture_transcript.bookmarklet.txt, which is pre-built.
 *
 * ES5-compatible syntax (var / function) so it runs on any modern page;
 * async/await is used only for the scroll pacing.
 */

(function () {
  'use strict';

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Resolve once the document has fully loaded (with a safety-net timeout so
  // the capture never hangs forever on a stuck page).
  function waitForComplete() {
    return new Promise(function (resolve) {
      if (document.readyState === 'complete') { resolve(); return; }
      window.addEventListener('load', function () { resolve(); }, { once: true });
      setTimeout(resolve, 5000);
    });
  }

  // Scroll downward in steps until the scroll position stops changing (the
  // bottom of the virtualized list), then jump back to the top so the saved
  // HTML starts at the conversation opening.
  async function scrollFullConversation() {
    var step = Math.max(1, window.innerHeight || 800);
    var maxSteps = 400;   // safety cap (~48,000px of scrolling)
    var lastY = -1;

    for (var i = 0; i < maxSteps; i++) {
      window.scrollBy(0, step);
      await sleep(120);
      var y = window.scrollY;
      if (y === lastY) { break; } // reached the bottom — no new virtual rows
      lastY = y;
    }

    window.scrollTo(0, 0);
    await sleep(400);   // let the list settle back at the top
  }

  function sanitizeFilename(raw) {
    var cleaned = String(raw || 'transcript')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80)
      .trim();
    return cleaned || 'transcript';
  }

  async function capture() {
    await waitForComplete();
    await scrollFullConversation();

    var html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    var filename = sanitizeFilename(document.title) + '.html';

    // Trigger a download via a Blob so the full HTML lands as a local file.
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    // Diagnostic: report size + message count, and flag a non-user opening.
    var messages = document.querySelectorAll('[data-message-author-role]');
    var firstRole = messages.length
      ? messages[0].getAttribute('data-message-author-role')
      : null;

    console.log(
      '[rover-capture] saved ' + filename + ' — ' +
      html.length + ' chars, ' + messages.length + ' messages, first role: ' + firstRole
    );
    if (firstRole && firstRole !== 'user') {
      console.warn(
        '[rover-capture] WARNING: first message is "' + firstRole +
        '", not "user" — transcript may start mid-conversation.'
      );
    }
  }

  capture();
})();
