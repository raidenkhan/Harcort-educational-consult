import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./jsonLd";

describe("serializeJsonLd", () => {
  it("keeps ordinary structured data readable to crawlers", () => {
    const json = serializeJsonLd({
      "@context": "https://schema.org",
      "@type": "Course",
      name: "ME 255 Thermodynamics",
      numberOfItems: 3,
    });
    expect(JSON.parse(json)).toEqual({
      "@context": "https://schema.org",
      "@type": "Course",
      name: "ME 255 Thermodynamics",
      numberOfItems: 3,
    });
  });

  it("cannot be closed by a </script> inside a value", () => {
    const json = serializeJsonLd({
      name: "Kofi </script><img src=x onerror=alert(1)>",
    });
    expect(json).not.toContain("</script");
    expect(json).not.toContain("<img");
    // …and it still decodes back to exactly the original text.
    expect(JSON.parse(json).name).toBe(
      "Kofi </script><img src=x onerror=alert(1)>",
    );
  });

  it("escapes ampersands and the JS line separators", () => {
    const json = serializeJsonLd({ bio: "Thermo & fluids \u2028 \u2029 done" });
    expect(json).not.toContain("&");
    expect(json).not.toContain("\u2028");
    expect(json).not.toContain("\u2029");
    expect(JSON.parse(json).bio).toBe("Thermo & fluids \u2028 \u2029 done");
  });
});
