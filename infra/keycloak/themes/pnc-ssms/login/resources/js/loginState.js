// Progressive enhancement only: on submit, swap the sign-in button into a
// spinner + "Signing in..." (localized via window.pncSigningInText, set in
// template.ftl). Keycloak's own onsubmit handler (login.disabled = true) still
// runs first and is what actually prevents double-submits - this script only
// changes what the button looks like while that's in effect.
(function () {
  const form = document.getElementById("kc-form-login");
  if (!form) {
    return;
  }

  form.addEventListener("submit", function () {
    const button = document.getElementById("kc-login");
    if (!button || button.dataset.pncLoading === "true") {
      return;
    }

    button.dataset.pncLoading = "true";
    button.textContent = window.pncSigningInText || "Signing in...";
    button.classList.add("pnc-button--loading");
    // The form's own onsubmit handler (login.disabled = true, in login.ftl)
    // already prevents a second submit and reflects "disabled" to assistive
    // tech; aria-busy additionally announces that the page is working.
    button.setAttribute("aria-busy", "true");
  });
})();
