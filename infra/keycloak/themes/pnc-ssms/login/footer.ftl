<#-- The base theme's footer.content macro is empty by design, meant to be overridden. -->
<#macro content>
<div class="pnc-footer">
  <span class="pnc-footer__copyright">${msg("pncFooterCopyright", .now?string("yyyy"))}</span>
  <span class="pnc-footer__product">${msg("pncFooterProduct")}</span>
  <#-- Placeholder targets - point these at real pages before shipping to production. -->
  <nav class="pnc-footer__links" aria-label="${msg('pncFooterHelp')}">
    <a href="#">${msg("pncFooterPrivacy")}</a>
    <a href="#">${msg("pncFooterHelp")}</a>
  </nav>
</div>
</#macro>
