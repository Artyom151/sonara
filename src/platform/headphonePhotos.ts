/**
 * Transparent product photos of earbuds and headphones (cut-out PNG/WebP on no background, so they sit on
 * the island's black like the Apple and Samsung ones). Taken from the makers' own product pages; the names
 * are matched against the name a device advertises. Longest names first, so "Liberty 5 Pro" wins over
 * "Liberty 5". Images load from the makers' servers at runtime (not stored here).
 */
export const PHOTO_CATALOG: [RegExp, string][] = [
  [/\bsoundcore\s*aerofit\s*2\s*ai\s*assistant\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3874Z12_DTC_listing_image_TD01_US_V2.png?v=1758533073"], // soundcore AeroFit 2 AI Assistant
  [/\bsoundcore\s*sleep\s*a30\s*special\b/i, "https://cdn.shopify.com/s/files/1/0493/9834/9974/files/D1301Z21_Rich_image_TD01_US_V1_9463ea7d-cfb9-48e7-9e38-662b79538482.png?v=1776777915"], // soundcore Sleep A30 Special
  [/\bsoundcore\s*liberty\s*5\s*pro\s*max\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/20260604-152640.png?v=1780558011"], // soundcore Liberty 5 Pro Max
  [/\bopenrun\s*pro\s*2\s*\(shokzsquad\)/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/OpenRun_Pro_2-BK-1.webp?v=1772616674"], // OpenRun Pro 2 (ShokzSquad)
  [/\bsoundcore\s*liberty\s*4\s*pro\b/i, "https://cdn.shopify.com/s/files/1/0493/9834/9974/files/A3954Z21_3840x_c616487c-7cb8-421c-9b34-b16329f4b307.webp?v=1776919307"], // soundcore Liberty 4 Pro
  [/\bsoundcore\s*liberty\s*5\s*pro\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/20260604-152452.png?v=1780557905"], // soundcore Liberty 5 Pro
  [/\bsoundcore\s*liberty\s*4\s*nc\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3947Z11_4088025e-9f6e-4ec4-ad98-69d8d7dbf357.png?v=1749638576"], // soundcore Liberty 4 NC
  [/\bsoundcore\s*aerofit\s*pro\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3871Z61_TD01_V1_1200x_e1e26c1b-4a31-4276-b8d2-4e00e51f2e4b.webp?v=1749638468"], // soundcore AeroFit Pro
  [/\bsoundcore\s*v40i\s*\&\s*c30i\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3878_A3330_2.png?v=1754972606"], // soundcore V40i & C30i
  [/\bsoundcore\s*aeroclip\s*2\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/D1105Z91_DTC_listing_image_TD01_US.png?v=1790153939"], // soundcore Aeroclip 2
  [/\bsoundcore\s*liberty\s*5\b/i, "https://cdn.shopify.com/s/files/1/0493/9834/9974/files/A3957Z11.png?v=1776866160"], // soundcore Liberty 5
  [/\bsoundcore\s*sleep\s*a20\b/i, "https://cdn.shopify.com/s/files/1/0493/9834/9974/files/A6611Z21_TD01_V1.png?v=1777347286"], // soundcore Sleep A20
  [/\bskullcandy\s*ecobuds™/i, "https://cdn.shopify.com/s/files/1/0635/5114/3993/files/BuyBox_EcoBuds_1.png?v=1708731952"], // Skullcandy EcoBuds™
  [/\bsoundcore\s*aerofit\s*2\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3874Z11_Rich_image_TD01_US_V2.png?v=1749635071"], // soundcore AeroFit 2
  [/\bsoundcore\s*space\s*a40\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3936012.png?v=1749638951"], // soundcore Space A40
  [/\bsoundcore\s*space\s*q45\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3040G11_64363979-86bd-4bbf-a122-d26fadaa97cd.png?v=1751962475"], // soundcore Space Q45
  [/\bsoundcore\s*sport\s*x20\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3968Z11_TD01_V1.png?v=1749635084"], // soundcore Sport X20
  [/\bsoundcore\s*aeroclip\b/i, "https://cdn.shopify.com/s/files/1/0493/9834/9974/files/A3388Z21_DTC_listing_image_TD01_US_V1_3840x_8a683de4-15d9-4d0d-8ad2-f0baa8b21d01.png?v=1777444498"], // soundcore AeroClip
  [/\bsmokin'\s*buds®\s*360\b/i, "https://cdn.shopify.com/s/files/1/0635/5114/3993/files/26A_Smokin_Buds_360_True_Black_S2SPW-T740_Buy_Boxes_1.png?v=1778185851"], // Smokin' Buds® 360
  [/\btribit\s*flybuds\s*c3\b/i, "https://cdn.shopify.com/s/files/1/0616/1838/9239/files/Flybuds_C3_Black.png?v=1779781445"], // TRIBIT FlyBuds C3
  [/\btribit\s*flybuds\s*3\b/i, "https://cdn.shopify.com/s/files/1/0616/1838/9239/files/92-800x800-1.png?v=1770194339"], // TRIBIT FlyBuds 3
  [/\bcmf\s*buds\s*2\s*plus\b/i, "https://cdn.shopify.com/s/files/1/0376/5420/0459/files/0000s_0079_CMF-Buds-2-Plus-case-lightgrey.png?v=1753435229&width=2000&height=2000&crop=center"], // CMF Buds 2 Plus
  [/\bsoundcore\s*c30i\b/i, "https://cdn.shopify.com/s/files/1/0493/9834/9974/files/A3330Z11.png?v=1777347334"], // soundcore C30i
  [/\bcmf\s*buds\s*pro\s*2\b/i, "https://cdn.shopify.com/s/files/1/0376/5420/0459/files/0000s_0070_CMF-Buds-Pro-2-case-lightgrey.png?v=1753437680&width=2000&height=2000&crop=center"], // CMF Buds Pro 2
  [/\bsoundcore\s*work\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/Group_2147226972.png?v=1776683440"], // soundcore Work
  [/\bsoundcore\s*c40i\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/Frame_427322111.png?v=1754540093"], // soundcore C40i
  [/\bsoundcore\s*p20i\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/20260304-121406.png?v=1772597724"], // soundcore P20i
  [/\bsoundcore\s*p30i\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/20250715-181408.png?v=1752574504"], // soundcore P30i
  [/\bsoundcore\s*p40i\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3955Z11_TD01_V1.png?v=1749638743"], // soundcore P40i
  [/\bsoundcore\s*q11i\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3005ZA1_ProductImage_01.png?v=1747792738"], // soundcore Q11i
  [/\bsoundcore\s*v20i\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3876Z11_Rich_image_ND01_no_copy_3600x4500px_V1_1.png?v=1751444531"], // soundcore V20i
  [/\bsoundcore\s*v40i\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/5_1f0462b1-3c88-49c5-8383-539361e8808e.webp?v=1749456107"], // soundcore V40i
  [/\baerofit\s*2\s*pro\b/i, "https://cdn.shopify.com/s/files/1/0493/9834/9974/files/MatteBlack-01.png?v=1778057200"], // AeroFit 2 Pro
  [/\bopenfit\s*air\s*2\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/OpenFit_Air_2-Black-1.webp?v=1785292439"], // OpenFit Air 2
  [/\bopenrun\s*air\s*2\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/OpenRun_Air_2-STBlack-1.webp?v=1787738547"], // OpenRun Air 2
  [/\bopenrun\s*pro\s*2\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/LunarWhiteStandard_1.webp?v=1783562552"], // OpenRun Pro 2
  [/\bsmokin’\s*buds®/i, "https://cdn.shopify.com/s/files/1/0635/5114/3993/files/smokin_buds_buy_box_black_1.png?v=1771460278"], // Smokin’ Buds®
  [/\bliberty\s*5\s*pro\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/D1203Z31_DTC_listing_image_TD01_US_V1_9a263917-afc5-4926-a8eb-7fce795e9bc4.png?v=1781596952"], // Liberty 5 Pro
  [/\bcmf\s*clip\s*pro\b/i, "https://cdn.shopify.com/s/files/1/0376/5420/0459/files/product-thumbnail-orange.webp?v=1785149726&width=2000&height=2000&crop=center"], // CMF Clip Pro
  [/\bopenswim\s*pro\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/SwimPro-WT-1_1.webp?v=1770195376"], // OpenSwim Pro
  [/\bliberty\s*buds\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/D1200Z31_listing_image_01_US_V2.png?v=1766133058"], // Liberty Buds
  [/\bcmf\s*buds\s*2a\b/i, "https://cdn.shopify.com/s/files/1/0376/5420/0459/files/0000s_0073_CMF-Buds-2a-case-orange.png?v=1753435086&width=2000&height=2000&crop=center"], // CMF Buds 2a
  [/\bopenfit\s*air\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/OpenFitAir-Black_bd831042-5915-4715-9a9b-69830ee4a335.webp?v=1715654183"], // OpenFit Air
  [/\bopenfit\s*pro\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/BK_1.webp?v=1766108924"], // OpenFit Pro
  [/\bopenrun\s*pro\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/OpenRun_Pro_Pink_1.png?v=1779850800"], // OpenRun Pro
  [/\bgo\s*air\s*pop\b/i, "https://cdn.shopify.com/s/files/1/0240/9337/files/1_GOPop__Blue_bf5b2f2b-f2fa-4b67-a868-26ebf225c857.png?v=1759297001"], // GO Air POP
  [/\bcmf\s*buds\s*2\b/i, "https://cdn.shopify.com/s/files/1/0376/5420/0459/files/0000s_0077_CMF-Buds-2-case-lightgreen_80b2e76e-a990-452b-83bf-81f5924a97d3.png?v=1753437813&width=2000&height=2000&crop=center"], // CMF Buds 2
  [/\bear\s*\(open\)/i, "https://cdn.shopify.com/s/files/1/0376/5420/0459/files/0000s_0028_Ear-_open_-white.png?v=1753436557&width=2000&height=2000&crop=center"], // Ear (open)
  [/\bopenfit\s*2\+/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/UCS__BK_1.webp?v=1766414025"], // OpenFit 2+
  [/\bsport\s*x10\b/i, "https://cdn.shopify.com/s/files/1/0493/9834/9974/files/20260304-122806.png?v=1777347310"], // Sport X10
  [/\bopenfit\s*2\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/openfit2-Black.webp?v=1735287107"], // OpenFit 2
  [/\bear\s*\(3a\)/i, "https://cdn.shopify.com/s/files/1/0376/5420/0459/files/product-thumbnail-white.png?v=1782317086&width=1000&height=1000&crop=center"], // Ear (3a)
  [/\bopenmove\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/products/GREY1.png?v=1734082856"], // OpenMove
  [/\bopenswim\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/products/BLACK1_dfbbf2f9-78e5-4757-ba82-6d15e29cb535.png?v=1640747495"], // OpenSwim
  [/\bgo\s*pop\+/i, "https://cdn.shopify.com/s/files/1/0240/9337/files/1_GOPop__Blue.png?v=1762446399"], // GO POP+
  [/\bear\s*\(3\)/i, "https://cdn.shopify.com/s/files/1/0376/5420/0459/files/Ear3-white_9c7c5465-3f29-4bb9-a438-7883444a6bad.png?v=1756911995&width=2000&height=2000&crop=center"], // Ear (3)
  [/\bear\s*\(a\)/i, "https://cdn.shopify.com/s/files/1/0376/5420/0459/files/0000s_0026_Ear-a-white.png?v=1753438274&width=2000&height=2000&crop=center"], // Ear (a)
  [/\bopenfit\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/files/OpenFit-Black.webp?v=1731395786"], // OpenFit
  [/\bopenrun\b/i, "https://cdn.shopify.com/s/files/1/0857/5574/products/BlackStandard_d259cb83-d50f-4290-9686-f91a817adb35.png?v=1744247814"], // OpenRun
  [/\baerofit\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/A3872Z11.png?v=1749639360"], // AeroFit
  [/\bp42i\b/i, "https://cdn.shopify.com/s/files/1/0516/3761/6830/files/D1205Z11_Richimage_TD01_DTC_US_V1.png?v=1784273470"], // P42i
];
