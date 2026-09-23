import careemLogo from "@/assets/careem-logo-full.svg";
import talabatLogo from "@/assets/talabat-logo.png.asset.json";

/**
 * The real platform wordmark, for LIGHT surfaces only (chart legends, tooltips, filter pills). Talabat
 * is an orange wordmark on transparent and Careem a dark-green wordmark, so both read on white/cream
 * with no recolouring. The dark pace bar needs the bright Careem and a recoloured Talabat, which the
 * raster Talabat asset cannot provide, so it is not used there (it keeps its coloured dots).
 */
export function PlatformLogo({ platform, className = "h-3.5 w-auto" }: { platform: "Talabat" | "Careem"; className?: string }) {
  return platform === "Talabat" ? (
    <img src={talabatLogo.url} alt="Talabat" className={className} />
  ) : (
    <img src={careemLogo} alt="Careem" className={className} />
  );
}
