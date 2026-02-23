export function ageVerificationInjectedScript(backgroundColor) {
  return `
    const style = document.createElement('style');
    style.textContent = \`
      html, body {
        margin: 0;
        padding: 0;
        background-color: ${backgroundColor} !important;
      }
      #app, #app.svelte-12qhfyh, .svelte-12qhfyh {
        background-color: ${backgroundColor} !important;
        min-height: 100%;
      }
      *, *::before, *::after {
        -webkit-tap-highlight-color: transparent;
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }
    \`;
    document.head.appendChild(style);
    document.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });
    document.querySelector('footer')?.remove();
    document.querySelector('[role="contentinfo"]')?.remove();

    function findAndHandleCloseMessage() {
      const p = document.querySelector('p.muted.svelte-1uha8ag');
      if (
        p &&
        p.textContent &&
        p.textContent.includes('You may now close this window.') &&
        window.ReactNativeWebView
      ) {
        p.remove();
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'verification-complete' })
        );
        return true;
      }
      return false;
    }
    if (!findAndHandleCloseMessage()) {
      const observer = new MutationObserver(function () {
        if (findAndHandleCloseMessage()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    true;
  `;
}
