export const AUTHORIZE_PAGE_SCRIPT = `(() => {
  const configNode = document.getElementById("authorize-config");
  const cfg = JSON.parse(configNode?.textContent || "{}");
  const statusBox = document.getElementById("status");
  const agreement = document.getElementById("agree");
  const square = document.querySelector(".square");
  const squareStatus = document.getElementById("square-status");
  const squareButton = document.getElementById("square-pay");
  const paypalCardBox = document.getElementById("paypal-card-buttons");
  const debugEnabled = new URLSearchParams(location.search).get("debug") === "1";
  const debugBox = debugEnabled ? document.createElement("pre") : null;
  const escapeHtml = value => String(value || "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const holdAmount = () => (cfg.currency || "JPY") + " " + Number(cfg.amount || 0).toLocaleString("en-US");
  const show = message => {
    if (!statusBox) return;
    statusBox.hidden = false;
    statusBox.textContent = message;
  };
  const ensureAgreement = () => {
    if (!agreement || agreement.checked) return true;
    show("Please agree to the hold and the cancellation policy first.");
    return false;
  };
  const showConfirmation = () => {
    const ref = cfg.shortCode || cfg.orderId || "";
    document.title = "Hold placed — we'll be in touch shortly";
    document.body.innerHTML = '<main class="auth-page"><section class="auth-shell confirmation-card"><h1>Hold placed ✓ — we\\'ll be in touch shortly</h1><p>We\\'ve placed a temporary hold of ' + escapeHtml(holdAmount()) + ' on your card for ' + escapeHtml(cfg.activity) + ' on ' + escapeHtml(cfg.activityDate) + '. Nothing has been charged.</p><h2>What happens next:</h2><ul><li>We\\'ll contact you shortly to double-check the details.</li><li>Please also send us a quick message to say you\\'ve completed this step — it helps us move faster.</li><li>Once everything is confirmed, you\\'ll receive our confirmation email. That email is your booking.</li><li>After the trip, the hold is released the same day (your bank may take a few days to show it).</li></ul><p class="booking-ref">Booking reference ' + escapeHtml(ref) + ' · WhatsApp +81 70-8952-3968 · info@nice.okinawa</p><p class="safe-close">This page is safe to close.</p></section></main>';
  };
  if (debugBox) {
    debugBox.id = "client-error-debug";
    debugBox.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;max-height:35vh;overflow:auto;padding:8px;background:#fff;color:#111;font:12px/1.4 monospace;white-space:pre-wrap";
    debugBox.textContent = "Diagnostics: waiting";
    document.body.appendChild(debugBox);
  }
  const reportClientError = (stage, error) => {
    const errorText = String(error && (error.stack || error.message) || error);
    const payload = { order_id: cfg.orderId || "", ts: new Date().toISOString(), stage, error: errorText, user_agent: navigator.userAgent, err: errorText, square_loaded: !!window.Square, appId: cfg.squareApplicationId || "", locId: cfg.squareLocationId || "", ua: navigator.userAgent, shortCode: cfg.shortCode || "" };
    const body = JSON.stringify(payload);
    if (debugBox) debugBox.textContent = body;
    fetch("/__client-error", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  };
  const highlightSquare = () => {
    if (!square) return;
    square.classList.add("square-highlight");
    square.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const paypalFallback = () => {
    const paypalStatus = document.getElementById("paypal-status");
    if (paypalStatus) {
      paypalStatus.hidden = false;
      paypalStatus.textContent = "PayPal didn't load — please use the card form below.";
    }
    highlightSquare();
  };
  const loadPayPal = () => {
    const script = document.createElement("script");
    const timer = setTimeout(paypalFallback, 20000);
    script.src = cfg.paypalJsBase + "?client-id=" + encodeURIComponent(cfg.clientId) + "&currency=" + encodeURIComponent(cfg.currency) + "&intent=authorize&components=buttons&enable-funding=card&locale=en_US";
    script.onload = () => {
      clearTimeout(timer);
      try { renderPayPal(); } catch (error) { paypalFallback(); reportClientError("paypal-render", error); console.error(error); }
    };
    script.onerror = () => {
      clearTimeout(timer);
      paypalFallback();
      reportClientError("paypal-sdk-load", new Error("PayPal SDK script failed to load"));
    };
    document.head.appendChild(script);
  };
  function renderPayPal() {
    const shared = {
      onClick: (data, actions) => ensureAgreement() ? actions.resolve() : actions.reject(),
      createOrder: () => Promise.resolve(cfg.orderId),
      onApprove: async data => {
        const response = await fetch("/api/paypal/authorize-order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: data.orderID, accepted_policy: true, policy_version: cfg.policyVersion, idempotency_key: "authorize-" + data.orderID }) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "Authorization failed");
        showConfirmation();
      },
      onError: error => { highlightSquare(); show("Authorization failed. Please use the card form below or contact us.\\n" + (error && error.message ? error.message : error)); }
    };
    paypal.Buttons({ ...shared, fundingSource: paypal.FUNDING.PAYPAL, style: { color: "gold" } }).render("#paypal-buttons");
    if (paypalCardBox) paypalCardBox.hidden = true;
    if (debugEnabled) show("PayPal buttons ready.");
  }
  const loadSquare = () => {
    if (!squareStatus || !squareButton) return;
    squareStatus.textContent = "Loading secure card form… this can take up to 20 seconds";
    let squareStage = "sdk-load";
    /* legacy test marker: }, 25000) */
    const squareTimeout = setTimeout(() => {
      squareStatus.textContent = "Card form didn't load — use the PayPal button or open in Safari";
      reportClientError(squareStage, new Error("Square initialization exceeded 20 seconds"));
    }, 20000);
    const squareFail = (stage, error) => {
      clearTimeout(squareTimeout);
      squareStatus.textContent = "Card form didn't load — use the PayPal button or open in Safari";
      reportClientError(stage, error);
      console.error(error);
    };
    try {
      if (!cfg.squareApplicationId || !cfg.squareLocationId) throw new Error("Square configuration missing: applicationId/locationId");
      const squareScript = document.createElement("script");
      squareScript.src = cfg.squareJsBase;
      squareScript.onload = async () => {
        try {
          squareStage = "payments-init";
          if (!window.Square) throw new Error("Square SDK global missing");
          const payments = window.Square.payments(cfg.squareApplicationId, cfg.squareLocationId);
          squareStage = "card-init";
          const card = await payments.card();
          squareStage = "card-attach";
          await card.attach("#square-card-container");
          clearTimeout(squareTimeout);
          squareStatus.textContent = 'Card details are handled securely by Square.';
          squareButton.disabled = false;
          squareButton.addEventListener("click", async () => {
            if (!ensureAgreement()) return;
            squareButton.disabled = true;
            try {
              const token = await card.tokenize();
              if (token.status !== "OK") throw new Error("Card verification failed");
              const response = await fetch("/api/square/create-payment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order_id: cfg.orderId, source_id: token.token, accepted_policy: true, policy_version: cfg.policyVersion }) });
              const result = await response.json().catch(() => ({}));
              if (!response.ok || !result.ok) {
                const message = result.error || result.message || response.statusText || "Square authorization failed";
                const detail = 'HTTP ' + response.status + ' ' + message;
                show("Square authorization failed.\\n" + detail);
                reportClientError("authorize-submit", new Error(detail));
                squareButton.disabled = false;
                return;
              }
              showConfirmation();
            } catch (error) {
              squareButton.disabled = false;
              show("Square authorization failed.\\n" + (error && error.message ? error.message : error));
              reportClientError("authorize-submit", error);
              console.error(error);
            }
          });
        } catch (error) { squareFail(squareStage, error); }
      };
      squareScript.onerror = () => squareFail("sdk-load", new Error("Square SDK script failed to load"));
      document.head.appendChild(squareScript);
    } catch (error) { squareFail(squareStage, error); }
  };
  loadPayPal();
  loadSquare();
})();`;
