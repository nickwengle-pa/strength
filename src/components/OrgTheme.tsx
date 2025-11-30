import { useEffect } from "react";
import { useOrg } from "../context/OrgContext";

export default function OrgTheme() {
  const { org } = useOrg();

  useEffect(() => {
    if (!org) return;

    const root = document.documentElement;
    
    if (org.primaryColor) {
      root.style.setProperty('--org-primary', org.primaryColor);
    } else {
      root.style.removeProperty('--org-primary');
    }

    if (org.secondaryColor) {
      root.style.setProperty('--org-secondary', org.secondaryColor);
    } else {
      root.style.removeProperty('--org-secondary');
    }
  }, [org?.primaryColor, org?.secondaryColor]);

  return null;
}
