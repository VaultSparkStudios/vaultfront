export type VaultFrontBrandTheme = "vaultfront" | "competitive";

export function applyVaultFrontBrandTheme(theme: VaultFrontBrandTheme): void {
  const resolved = theme === "competitive" ? "competitive" : "vaultfront";
  document.documentElement.setAttribute("data-vaultfront-theme", resolved);
}

