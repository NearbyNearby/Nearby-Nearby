import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import HoursDisplay from '../common/HoursDisplay';

/* ================================================================== *
 * PoiHeader — shared intro header for all POI detail pages.
 * SVG paths copied VERBATIM from nn-templates/single-poi-page-01.html
 * (the <header class="page_header_poi_style_1"> block, lines ~248-368).
 * ================================================================== */

/* ── Template-verbatim SVGs ───────────────────────────────────────── */

const SVG_STYLE = {
  fillRule: 'evenodd',
  clipRule: 'evenodd',
  strokeLinejoin: 'round',
  strokeMiterlimit: 2,
};

export const SvgDirections = () => (
  <svg className="poi_button_icon" width="12" height="12" viewBox="0 0 13 12" version="1.1" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(1,0,0,1,-139.876,-2032.55)">
      <path d="M151.847,2033.51L146.797,2044.07C146.676,2044.32 146.411,2044.47 146.133,2044.45C145.854,2044.42 145.622,2044.22 145.551,2043.95L144.49,2039.93L140.387,2038.95C140.112,2038.88 139.909,2038.65 139.879,2038.37C139.85,2038.09 140.001,2037.82 140.256,2037.7L150.96,2032.62C151.215,2032.49 151.518,2032.55 151.718,2032.75C151.917,2032.95 151.969,2033.25 151.847,2033.51ZM149.833,2034.63L142.534,2038.1L145.188,2038.73C145.427,2038.79 145.615,2038.97 145.678,2039.21L146.377,2041.86L149.833,2034.63Z" />
    </g>
  </svg>
);

export const SvgLatLong = () => (
  <svg className="poi_button_icon" width="12" height="12" viewBox="0 0 12 12" version="1.1" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(1.22222e-17,-0.199603,0.225225,1.3791e-17,-149.853,124.328)">
      <path d="M591.314,683.233L591.314,669.899L584.968,675.523C584.381,676.043 583.427,676.043 582.84,675.523C582.253,675.003 582.253,674.158 582.84,673.637L591.754,665.737C592.041,665.483 592.423,665.347 592.818,665.347C593.213,665.347 593.595,665.483 593.882,665.737L602.796,673.637C603.383,674.158 603.383,675.003 602.796,675.523C602.209,676.043 601.255,676.043 600.668,675.523L594.322,669.899L594.322,683.424C598.252,684.217 601.296,687.084 601.91,690.654L617.741,690.654L611.395,685.03C610.808,684.509 610.808,683.665 611.395,683.144C611.983,682.624 612.936,682.624 613.523,683.144L622.437,691.044C622.724,691.298 622.878,691.637 622.878,691.987C622.878,692.337 622.724,692.676 622.437,692.93L613.523,700.83C612.936,701.35 611.983,701.35 611.395,700.83C610.808,700.31 610.808,699.465 611.395,698.944L617.741,693.32L601.91,693.32C601.296,696.891 598.252,699.757 594.322,700.55L594.322,714.075L600.668,708.451C601.255,707.931 602.209,707.931 602.796,708.451C603.383,708.971 603.383,709.816 602.796,710.337L593.882,718.237C593.595,718.491 593.213,718.627 592.818,718.627C592.423,718.627 592.041,718.491 591.754,718.237L582.84,710.337C582.253,709.816 582.253,708.971 582.84,708.451C583.427,707.931 584.381,707.931 584.968,708.451L591.314,714.075L591.314,700.741C586.719,700.415 583.004,697.307 582.318,693.32L567.895,693.32L574.241,698.944C574.828,699.465 574.828,700.31 574.241,700.83C573.653,701.35 572.7,701.35 572.113,700.83L563.199,692.93C562.912,692.676 562.758,692.337 562.758,691.987C562.758,691.637 562.912,691.298 563.199,691.044L572.113,683.144C572.7,682.624 573.653,682.624 574.241,683.144C574.828,683.665 574.828,684.509 574.241,685.03L567.895,690.654L582.318,690.654C583.004,686.667 586.719,683.559 591.314,683.233ZM591.314,685.502C588.128,685.808 585.55,687.918 584.907,690.654C584.806,691.084 584.753,691.53 584.753,691.987C584.753,692.444 584.806,692.89 584.907,693.32C585.55,696.056 588.128,698.166 591.314,698.472C591.576,698.497 591.844,698.51 592.114,698.51C592.883,698.51 593.625,698.406 594.322,698.211C596.84,697.509 598.776,695.64 599.321,693.32C599.422,692.89 599.475,692.444 599.475,691.987C599.475,691.53 599.422,691.084 599.321,690.654C598.776,688.334 596.84,686.465 594.322,685.763C593.625,685.568 592.883,685.464 592.114,685.464C591.844,685.464 591.576,685.477 591.314,685.502Z" />
    </g>
  </svg>
);

export const SvgCall = () => (
  <svg className="poi_button_icon" width="12" height="12" viewBox="0 0 12 12" version="1.1" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(0.0121647,0,0,0.0121647,-0.234328,-0.227993)">
      <path d="M548.4,273.9C526.3,270.2 511.3,249.1 514.8,226.7C518.5,204.5 539.65,189.4 561.95,193.1C628.85,204.4 690,236 738.7,284.5C787.2,333 818.8,394 830.2,461C832.1,471.7 829.7,482.5 823.4,491.5C817.1,500.6 807.6,506.5 796.7,508.3L796.4,508.4C794.8,508.7 792.5,509 789.9,509C769.8,509 752.8,494.7 749.5,474.9C740.9,424.7 717.1,378.9 680.8,342.6C644.3,306.2 598.5,282.5 548.4,273.9ZM800.5,617.2L911.5,728.4C934.5,751.4 946.7,778.7 946.8,807.3C946.9,835.8 934.9,863.4 912.2,887.1C903.4,896.5 894.3,905.2 885.4,913.7C872.5,926.1 861,937.2 851,949.2L850,950.3L849.5,950.8C816.1,986.9 773.5,1005.2 723,1005.2C718.5,1005.2 714.2,1005 710.1,1004.8L709.3,1004.8C637.3,1000.1 573.45,973.5 525.95,950.8C402.65,891.1 294.3,806.3 204.1,698.8C130.2,609.8 80.2,526.4 46.9,436.4C24.9,376.9 16.4,327.25 20.1,280.25C23.6,240.55 39.7,206 68,177.7L137.3,108.5L137.5,108.3C160.6,86.2 187.7,74.5 216.1,74.5C244.6,74.5 271.5,86.2 293.7,108.3C305.1,118.8 316.4,130.3 327.3,141.4L331.7,145.9L341.1,155.4L350.6,165L405.9,220.3C429.6,243.9 442.2,271.4 442.2,299.7C442.3,328.1 429.7,355.7 405.9,379.5L397.3,388.2L388.8,396.8C376.3,409.6 363,423.1 348.7,436.6C360,460 375.4,483.5 397.4,511.2C448.8,574.2 502.1,622.8 560.5,659.9C566.3,663.5 573.3,667 579.4,670.1L582.3,671.5L586.4,673.6L643.3,616.7C666.2,593.7 693.5,581.6 722.1,581.6C751,581.6 778.1,593.9 800.5,617.2ZM789.5,895.9C802.1,880.9 815.5,867.9 829.5,854.8L834,850.4C840.9,843.7 847.4,837.4 853.5,830.8L853.6,830.7C873,810.3 865.5,797.3 854.5,786.3L742.6,674.4C737.8,669.4 730.4,663.5 722.8,663.5C714.6,663.5 706.8,669.5 701.8,674.5L632.6,743.7C621.3,755.6 607.3,761.9 592.1,761.9C583.2,761.9 574.6,759.8 565.9,755.4L564,754.4L563.7,754.2L562.5,753.5C556.7,750 549.7,746.4 543.5,743.3C535.1,739.1 526.1,734.5 517.4,729C450.9,686.8 391,632.2 334.2,562.3L334.1,562.1C302.1,521.6 281.3,487.7 266.5,452L266.1,451.1L265.5,449.5C257.6,426.7 262.2,406.5 279.1,389.6L280.8,387.9C296.7,373.8 311.3,359 326.8,343.3L330.9,339.1C336.7,333.1 342.6,327.2 348.4,321.4C364.5,305.3 364.5,294 348.4,277.9L293.2,222.7C286.3,216 279.5,209 273.6,202.9L273.2,202.5C260.9,190.1 249.3,178.3 237.4,167.1L237.1,166.8C229.8,159.7 222.9,156.1 216.4,156.1C209.5,156.1 202.1,159.8 194.9,166.7L126.1,235.5C111.4,250 103.7,266.4 101.9,287C99.1,322.3 105.9,359.7 123.9,408C154,489.2 199.5,565 267,646.3C349.5,744.9 448.7,822.5 561.9,877C602.9,896.5 657.4,919.3 715,923C718,923.2 720.9,923.4 723.5,923.4C751.3,923.4 771.7,914.9 789.5,895.9ZM1004.1,453C1006,463.7 1003.6,474.5 997.2,483.4C990.9,492.5 981.4,498.4 970.5,500.2L970.2,500.3C968.6,500.6 966.5,500.9 964,500.9L963.7,500.9C943.6,500.9 926.6,486.6 923.3,466.8C907.7,375.2 864.4,291.7 798,225.3C731.6,159 648.1,115.6 556.4,100C534.3,96.3 519.2,75.2 522.9,52.9C526.6,30.7 547.7,15.6 570,19.3C678.4,37.6 777.2,88.8 856,167.4C934.5,245.9 985.7,344.7 1004.1,453Z" />
    </g>
  </svg>
);

export const SvgWebsite = () => (
  <svg className="poi_button_icon" width="12" height="12" viewBox="0 0 13 13" version="1.1" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(0.0111111,0,0,0.0111111,-0.533211,-0.533214)">
      <path d="M599.989,1151.99C295.132,1151.99 47.989,904.847 47.989,599.989C47.989,295.132 295.132,47.989 599.989,47.989C904.846,47.989 1151.99,295.132 1151.99,599.989C1151.99,904.847 904.846,1151.99 599.989,1151.99ZM633.509,119.367L633.525,322.428C693.018,320.559 749.612,313.748 801.406,302.857C760.704,205.253 701.153,136.797 633.509,119.367ZM1083.79,633.529L922.837,633.529C920.152,711.482 908.172,785.199 888.703,851.176C924.818,862.426 958.131,875.783 987.962,890.983C1042.57,818.298 1077.22,729.769 1083.79,633.529ZM801.142,897.756C749.468,886.696 692.972,879.708 633.529,877.654L633.509,1080.6C701.011,1063.21 760.446,995.021 801.142,897.756ZM256.652,257.542C279.918,268.216 305.475,277.803 332.944,286.141C353.143,235.665 378.152,191.339 407.064,154.957C350.52,179.504 299.57,214.515 256.652,257.542ZM824.038,366.745C765.161,379.69 700.874,387.565 633.525,389.527L633.523,566.447L855.717,566.45C853.044,494.369 841.837,426.73 824.038,366.745ZM988.871,310.225C958.814,325.35 925.292,338.612 888.985,349.753C908.288,415.492 920.169,488.881 922.84,566.46L1083.8,566.466C1077.26,470.757 1042.95,382.682 988.871,310.225ZM855.714,633.518L633.523,633.521L633.523,810.538C700.854,812.701 765.075,820.774 823.828,833.913C841.747,773.758 853.033,705.874 855.714,633.518ZM375.742,832.56C434.736,819.806 499.083,812.125 566.456,810.36L566.458,633.533L344.264,633.53C346.926,705.34 358.058,772.745 375.742,832.56ZM943.347,257.546C900.435,214.522 849.498,179.521 793.097,155.075C821.831,191.323 846.847,235.659 867.055,286.142C894.523,277.807 920.08,268.22 943.347,257.546ZM398.576,302.867C450.38,313.757 506.966,320.568 566.455,322.434L566.474,119.382C498.823,136.804 439.272,205.256 398.576,302.867ZM942.291,943.499C919.253,932.79 893.926,923.156 866.683,914.754C846.553,964.852 821.675,1008.86 792.948,1045.02C849.026,1020.68 899.6,986.04 942.291,943.499ZM566.456,1080.61L566.457,877.453C506.916,879.137 450.241,885.772 398.309,896.492C439.015,994.431 498.669,1063.14 566.456,1080.61ZM210.239,888.567C240.514,873.526 274.243,860.35 310.754,849.313C291.607,783.812 279.827,710.75 277.168,633.528L116.213,633.522C122.711,728.699 156.673,816.334 210.239,888.567ZM344.271,566.459L566.461,566.459L566.462,389.544C499.109,387.578 434.827,379.702 375.95,366.758C358.152,426.741 346.945,494.382 344.271,566.459ZM255.622,941.411C298.744,984.907 350.037,1020.27 406.886,1044.91C377.988,1008.45 352.851,963.813 332.586,912.968C304.894,921.24 279.113,930.775 255.622,941.411ZM116.213,566.46L277.162,566.463C279.834,488.878 291.714,415.489 311.021,349.756C274.705,338.611 241.18,325.347 211.131,310.228C157.051,382.681 122.748,470.755 116.213,566.46Z"/>
    </g>
  </svg>
);

export const SvgNearby = () => (
  <svg className="poi_button_icon" width="12" height="12" viewBox="0 0 12 12" version="1.1" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(0.118242,0,0,0.118035,-89.8938,-12.697)">
      <path d="M833.67,150.197C833.898,148.957 835.094,145.061 835.249,143.843C836.435,134.53 833.783,127.139 828.962,122.269C824.068,117.325 817.189,114.958 810.355,114.921C803.529,114.885 796.796,117.364 791.74,122.084C783.356,129.911 785.54,143.889 785.54,143.889C786.237,150.252 791.583,157.022 796.933,164.782C801.998,172.129 807.271,180.067 810.281,187.837C812.267,182.749 815.254,177.488 818.525,172.378C818.564,172.957 818.624,173.546 818.704,174.146L818.727,174.169C818.975,176.436 819.98,178.792 821.397,181.266C818.991,185.546 817.013,189.869 815.873,193.947L815.754,194.303C815.236,195.624 814.499,196.586 813.727,197.248L812.118,198.233L811.171,198.516L810.161,198.618L809.138,198.517L808.156,198.216L806.494,197.12L805.345,195.615C805.076,195.127 804.841,194.559 804.674,193.937C802.365,185.604 796.48,176.958 790.99,168.994C784.908,160.172 779.275,152.22 778.364,144.97L778.31,144.752C776.692,132.605 780.379,123.114 786.65,116.848C792.906,110.597 801.67,107.523 810.394,107.57C819.11,107.617 827.838,110.755 834.08,117.061C840.242,123.286 844.343,133.851 841.295,148.732C838.69,148.773 836.088,149.257 833.67,150.197ZM841.823,151.302C847.203,151.331 852.603,153.235 856.456,157.128C860.302,161.013 862.496,166.898 861.502,174.352C861.373,176.484 860.275,178.659 858.795,181.142C857.296,183.657 855.355,186.442 853.314,189.399C849.259,195.271 844.881,201.844 843.199,207.862C842.483,209.687 840.8,209.696 840.309,207.862C838.64,201.841 834.437,195.566 830.469,189.811C826.486,184.033 822.662,178.906 822.144,174.169L822.121,174.146C821.127,166.687 823.316,160.838 827.167,156.99C831.025,153.135 836.443,151.273 841.823,151.302ZM841.822,164.345C838.142,164.345 835.123,167.363 835.123,171.044C835.123,174.726 838.142,177.743 841.822,177.743C845.502,177.743 848.5,174.726 848.5,171.044C848.5,167.363 845.502,164.345 841.822,164.345ZM786.63,166.08C786.3,166.92 785.822,167.794 785.262,168.733C784.246,170.437 782.932,172.323 781.548,174.327C778.801,178.305 775.835,182.758 774.696,186.835C774.211,188.072 773.071,188.078 772.738,186.835C771.607,182.756 768.76,178.505 766.072,174.606C763.373,170.692 760.782,167.218 760.431,164.009L760.415,163.993C759.743,158.94 761.225,154.977 763.834,152.37C766.448,149.758 770.118,148.497 773.763,148.516C774.558,148.521 775.353,148.585 776.138,148.711C776.845,150.437 777.776,152.224 778.878,154.099C781.008,157.904 783.746,161.897 786.63,166.08ZM773.764,157.947C771.116,157.947 768.944,160.118 768.944,162.767C768.944,165.416 771.116,167.587 773.764,167.587C776.412,167.587 778.569,165.416 778.569,162.767C778.569,160.118 776.412,157.947 773.764,157.947ZM808.508,127.943C813.995,127.943 818.465,132.442 818.465,137.931C818.465,143.42 813.995,147.919 808.508,147.919C803.022,147.919 798.521,143.42 798.521,137.931C798.521,132.442 803.022,127.943 808.508,127.943Z"/>
    </g>
  </svg>
);

export const SvgShare = () => (
  <svg className="poi_button_icon" width="12" height="12" viewBox="0 0 12 12" version="1.1" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(0.97678,0,0,0.97678,-1630.05,-1283.49)">
      <path d="M1673.44,1321.78C1672.96,1322.37 1672.23,1322.75 1671.41,1322.75C1669.97,1322.75 1668.8,1321.58 1668.8,1320.15C1668.8,1318.71 1669.97,1317.54 1671.41,1317.54C1672.23,1317.54 1672.96,1317.92 1673.44,1318.52L1675.94,1317.27C1675.88,1317.06 1675.85,1316.84 1675.85,1316.61C1675.85,1315.17 1677.02,1314 1678.46,1314C1679.89,1314 1681.06,1315.17 1681.06,1316.61C1681.06,1318.05 1679.89,1319.21 1678.46,1319.21C1677.64,1319.21 1676.9,1318.83 1676.43,1318.24L1673.93,1319.49C1673.98,1319.7 1674.01,1319.92 1674.01,1320.15C1674.01,1320.37 1673.98,1320.6 1673.93,1320.81L1676.44,1322.06C1676.92,1321.46 1677.65,1321.08 1678.48,1321.08C1679.92,1321.08 1681.09,1322.24 1681.09,1323.68C1681.09,1325.12 1679.92,1326.29 1678.48,1326.29C1677.04,1326.29 1675.88,1325.12 1675.88,1323.68C1675.88,1323.46 1675.9,1323.24 1675.96,1323.03L1673.44,1321.78ZM1677,1323.35C1676.97,1323.46 1676.96,1323.57 1676.96,1323.68C1676.96,1324.52 1677.64,1325.2 1678.48,1325.2C1679.32,1325.2 1680,1324.52 1680,1323.68C1680,1322.84 1679.32,1322.16 1678.48,1322.16C1678.02,1322.16 1677.6,1322.37 1677.32,1322.7C1677.16,1322.88 1677.05,1323.11 1677,1323.35ZM1677.31,1317.6C1677.59,1317.92 1678,1318.13 1678.46,1318.13C1679.3,1318.13 1679.98,1317.45 1679.98,1316.61C1679.98,1315.77 1679.3,1315.09 1678.46,1315.09C1677.62,1315.09 1676.94,1315.77 1676.94,1316.61C1676.94,1316.73 1676.95,1316.84 1676.98,1316.95C1677.03,1317.2 1677.15,1317.42 1677.31,1317.6ZM1672.56,1319.15C1672.28,1318.83 1671.87,1318.62 1671.41,1318.62C1670.57,1318.62 1669.89,1319.31 1669.89,1320.15C1669.89,1320.99 1670.57,1321.67 1671.41,1321.67C1671.87,1321.67 1672.28,1321.46 1672.56,1321.14C1672.72,1320.95 1672.83,1320.73 1672.89,1320.49C1672.91,1320.38 1672.93,1320.26 1672.93,1320.15C1672.93,1320.03 1672.91,1319.91 1672.89,1319.81C1672.83,1319.56 1672.72,1319.34 1672.56,1319.15Z"/>
    </g>
  </svg>
);

export const SvgVerified = () => (
  <svg className="poi_button_icon" viewBox="0 0 12 12" version="1.1" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(0.0176433,0,0,0.0176433,-4.586,-4.58602)">
      <path d="M600,259.93C634.012,259.93 643.281,307.055 676.133,315.856C708.984,324.661 740.582,288.489 770.039,305.497C799.492,322.501 783.953,367.954 808,392.005C832.051,416.052 877.504,400.513 894.508,429.966C911.516,459.419 875.344,491.02 884.149,523.872C892.95,556.72 940.075,565.993 940.075,600.001C940.075,634.013 892.95,643.282 884.149,676.134C875.344,708.985 911.516,740.583 894.508,770.04C877.504,799.493 832.051,783.954 808,808.001C783.953,832.052 799.492,877.505 770.039,894.509C740.582,911.517 708.985,875.345 676.133,884.15C643.281,892.951 634.012,940.076 600,940.076C565.992,940.076 556.719,892.951 523.871,884.15C491.02,875.345 459.418,911.517 429.965,894.509C400.512,877.505 416.051,832.052 392.004,808.001C367.953,783.954 322.5,799.493 305.496,770.04C288.488,740.583 324.66,708.986 315.855,676.134C307.054,643.282 259.929,634.013 259.929,600.001C259.929,565.993 307.054,556.72 315.855,523.872C324.66,491.021 288.488,459.419 305.496,429.966C322.5,400.513 367.953,416.052 392.004,392.005C416.051,367.954 400.512,322.501 429.965,305.497C459.418,288.489 491.019,324.661 523.871,315.856C556.719,307.055 565.992,259.93 600,259.93ZM600,373.293C539.87,373.293 482.206,397.178 439.69,439.698C397.171,482.218 373.288,539.883 373.288,600.008C373.288,660.138 397.17,717.802 439.69,760.318C482.21,802.833 539.875,826.72 600,826.72C639.798,826.72 678.896,816.247 713.36,796.349C747.824,776.451 776.446,747.83 796.344,713.365C816.242,678.9 826.715,639.806 826.715,600.005C826.715,560.204 816.242,521.11 796.344,486.645C776.446,452.181 747.825,423.559 713.36,403.661C678.895,383.763 639.797,373.293 600,373.293ZM600,392.18C704.34,392.18 807.82,495.66 807.82,600C807.82,704.34 704.34,807.82 600,807.82C495.66,807.82 392.18,704.34 392.18,600C392.18,495.66 495.66,392.18 600,392.18ZM695.168,505.45C688.941,505.275 683.024,508.181 679.356,513.216L579.066,646.926L518.906,586.762C501.101,568.227 473.656,595.668 492.191,613.477L567.761,689.047C575.89,697.172 589.336,696.219 596.234,687.024L709.594,535.884C719.031,523.661 710.609,505.888 695.168,505.45Z"/>
    </g>
  </svg>
);

export const SvgSponsor = () => (
  <svg className="poi_sponsor_icon" viewBox="0 0 23 35" version="1.1" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(1.02578,0,0,1.02578,-39.9559,-28.7337)">
      <path d="M61,36.001C61.134,36.412 60.986,36.865 60.637,37.119L55.015,41.205L57.162,47.815C57.296,48.226 57.149,48.679 56.799,48.933C56.449,49.186 55.973,49.186 55.623,48.933L50,44.848L44.377,48.933C44.206,49.057 44,49.124 43.789,49.124C43.24,49.124 42.789,48.673 42.789,48.124C42.789,48.019 42.806,47.915 42.838,47.815L44.985,41.205L39.364,37.119C39.105,36.931 38.952,36.63 38.952,36.31C38.952,35.761 39.403,35.31 39.952,35.31L46.902,35.31L49.048,28.701C49.183,28.291 49.568,28.012 50,28.012C50.432,28.012 50.817,28.291 50.952,28.701L53.099,35.31L60.049,35.31C60.481,35.31 60.866,35.59 61,36.001ZM53.251,40.014L56.972,37.31L52.372,37.31C51.94,37.31 51.555,37.03 51.421,36.619L50,32.246L48.58,36.619C48.445,37.032 48.061,37.31 47.628,37.31L43.028,37.31L46.749,40.014C47.098,40.268 47.246,40.721 47.112,41.132L45.69,45.506L49.412,42.802C49.762,42.549 50.238,42.549 50.588,42.802L54.309,45.506L52.888,41.132C52.754,40.721 52.901,40.268 53.251,40.014ZM50.595,57.416L50.546,57.608C50.427,57.85 50.302,57.925 50.229,57.955C50.156,57.985 50.079,58.001 50.001,58.001C49.673,57.999 49.404,57.731 49.402,57.403L49.402,48.598C49.402,48.27 49.672,48 50,48C50.328,48 50.598,48.27 50.598,48.598L50.595,57.416ZM55.418,61.415L55.369,61.608C55.25,61.85 55.125,61.925 55.052,61.955C54.979,61.986 54.902,62.001 54.824,62.001C54.496,62 54.227,61.731 54.225,61.403L54.225,50.598C54.225,50.27 54.495,50 54.823,50C55.151,50 55.421,50.27 55.421,50.598L55.418,61.415ZM45.772,61.415L45.723,61.608C45.604,61.85 45.479,61.925 45.406,61.955C45.333,61.986 45.256,62.001 45.178,62.001C44.85,62 44.581,61.731 44.579,61.403L44.579,50.598C44.579,50.27 44.849,50 45.177,50C45.505,50 45.775,50.27 45.775,50.598L45.772,61.415Z" />
    </g>
  </svg>
);

export const SvgPencil = () => (
  <svg className="poi_button_icon" width="12" height="12" viewBox="0 0 12 13" version="1.1" xmlns="http://www.w3.org/2000/svg" style={SVG_STYLE} aria-hidden="true">
    <g transform="matrix(0.0102972,0,0,0.0102972,-0.17807,-0.178307)">
      <path d="M1090.3,632.008C1090.3,606.495 1110.98,585.776 1136.43,585.776C1162,585.776 1182.66,606.501 1182.66,632.005L1182.66,1031.71C1182.66,1114.9 1114.82,1182.7 1031.67,1182.7L168.28,1182.7C85.09,1182.7 17.293,1114.91 17.293,1031.71L17.293,168.325C17.293,85.135 85.081,17.338 168.28,17.338L570.94,17.338C596.512,17.338 617.169,38.012 617.169,63.521C617.169,89.089 596.444,109.75 570.94,109.75L168.28,109.75C136.059,109.75 109.697,136.112 109.697,168.333L109.697,1031.67C109.697,1063.89 136.059,1090.26 168.28,1090.26L1031.72,1090.3C1063.87,1090.3 1090.3,1063.94 1090.3,1031.72L1090.3,632.008ZM1102.96,644.675C1101.19,644.493 1099.47,644.117 1097.83,643.587C1100.91,644.954 1102.96,644.675 1102.96,644.675ZM781.123,147.183L866.861,61.445C925.754,2.603 1021.55,2.608 1080.38,61.449L1138.56,119.625C1197.04,178.163 1197.3,274.002 1138.66,332.839L643.14,830.132C609.408,863.962 571.432,885.707 525.222,897.493L302.978,954.213C269.902,962.642 237.214,933.17 247.277,896.522L303.089,676.226C314.825,630.019 336.527,591.705 370.159,558.077L781.123,147.183ZM879.083,179.829L1020.31,321.056L1073.29,267.838C1096.07,245.017 1096.13,207.934 1073.19,184.957L1014.94,126.792C992.161,104.018 954.86,104.01 932.127,126.784L879.083,179.829ZM955.093,386.497L813.8,245.203L435.477,623.527C413.338,645.666 400.283,668.546 392.628,698.819L355.437,845.609L502.48,808.079C532.709,800.38 555.807,787.248 577.772,765.196L955.093,386.497Z" />
    </g>
  </svg>
);

/* ── Helpers ──────────────────────────────────────────────────────── */

const formatLastUpdated = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
};

const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch { return false; }
};

const getCoords = (poi) => {
  if (!poi) return null;
  const lat = poi.front_door_latitude ?? poi.latitude ?? poi.location?.coordinates?.[1] ?? poi.location?.y;
  const lng = poi.front_door_longitude ?? poi.longitude ?? poi.location?.coordinates?.[0] ?? poi.location?.x;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
};

/* ── Internal button building block ───────────────────────────────── */

function TealButton({ extraClass = '', children, onClick, href, target, rel, type = 'button', ...rest }) {
  const cls = `btn_reset button btn_outline_teal btn_poi_button_1${extraClass ? ' ' + extraClass : ''}`;
  if (href) {
    return (
      <a className={cls} href={href} target={target || '_blank'} rel={rel || 'noopener noreferrer'} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}

/* ── Main component ───────────────────────────────────────────────── */

export default function PoiHeader({
  poi,
  paid = false,
  displayLoc = {},
  mainCategory,
  statusVariant,         // 'open' | 'closed' | 'opensoon'
  statusLabel,           // e.g. "Open Now – Until 8:00 PM"
  onDirections,
  onCopyLatLong,
  onShare,
  onSuggestEdit,
  onViewNearby,
  extraButtons = [],     // [{ label, svg, onClick, href, target, rel, extraClass }]
  titleLeader = null,    // optional node before h1 (e.g., status banner)
  subtitleExtras = null, // optional extra content after main category (e.g., venue line)
  hideStatus = false,    // All four POI types hide the admin Status + Status Message
                          // block until user profiles ship (#139/#144/#145); Event sets
                          // it too (#142 item 2) because EventStatusBanner owns its status.
  typeInfoBox = null,    // type-specific info block in poi_col2, before the verified badge
                          // (Trail: route/length/difficulty; Event will use this too)
}) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [hoursExpanded, setHoursExpanded] = useState(false);

  const hideExact = !!displayLoc.hideExact;
  const coords = hideExact ? null : getCoords(poi);

  const countyRaw = displayLoc.county || poi?.address_county;
  const countyFmt = countyRaw
    ? (/county$/i.test(String(countyRaw).trim()) ? countyRaw : `${countyRaw} County`)
    : null;
  const locationParts = [
    displayLoc.city || poi?.address_city,
    countyFmt,
    displayLoc.state || poi?.address_state,
  ].filter((s) => s && String(s).trim());
  const locationLine = locationParts.join(', ');

  const phoneHref = poi?.phone_number ? `tel:${poi.phone_number}` : null;
  const rawWeb = poi?.website_url;
  const webHref = rawWeb
    ? (String(rawWeb).startsWith('http') ? rawWeb : `https://${rawWeb}`)
    : null;

  const handleDirections = onDirections || (() => {
    if (!coords) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`,
      '_blank',
      'noopener,noreferrer'
    );
  });

  // #142 item 5: the "Copied!" flash reads this component's own state, so it has
  // to fire for a parent-supplied handler too. POIDetailLayout always passes
  // onCopyLatLong, which used to leave the button silent on every POI page.
  // A parent handler reports failure by returning false (undefined means "no
  // signal", so treat it as success); a throw never flashes and never escapes.
  const handleCopyLatLong = async () => {
    let ok;
    try {
      ok = onCopyLatLong
        ? await onCopyLatLong()
        : (coords ? await copyToClipboard(`${coords.lat}, ${coords.lng}`) : false);
    } catch {
      return;
    }
    if (ok === false) return;
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const handleShare = onShare || (async () => {
    const shareData = { title: poi?.name || 'Nearby Nearby', url: typeof window !== 'undefined' ? window.location.href : '' };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch { /* fall through */ }
    }
    await copyToClipboard(shareData.url);
  });

  const handleViewNearby = onViewNearby || (() => {
    document.getElementById('one_search_magic')?.scrollIntoView({ behavior: 'smooth' });
  });

  const handleSuggestEdit = onSuggestEdit || (() => {
    if (typeof window !== 'undefined') {
      window.location.href = `/claim-business?poi_id=${encodeURIComponent(poi?.id || '')}`;
    }
  });

  // Status row. Barry's design colors only the leading status WORD and drops the
  // bullet dot. Our statusLabel is richer than his (e.g. "Open until 8:00 PM",
  // "Closed · Opens Tomorrow 9:00 AM"), so color the first word and leave the
  // remainder plain rather than his literal slice (which assumed label==word).
  let statusCls = null;
  let statusWordColor = null;
  let statusTopText = null;
  if (statusVariant === 'open') {
    statusCls = 'poi_page_hours_opennow';
    statusWordColor = '#226226';
    statusTopText = 'Fully Open';
  } else if (statusVariant === 'closed') {
    statusCls = 'poi_page_hours_closed';
    statusWordColor = '#AF1818';
    statusTopText = 'Closed';
  } else if (statusVariant === 'opensoon') {
    statusCls = 'poi_page_hours_opensoon';
    statusWordColor = '#7A4E00';
    statusTopText = 'Opens Soon';
  }
  // Barry's poi_status slot is the admin-set OPERATIONAL status ("Fully Open",
  // "Temporarily Closed", ...). Prefer it when present; the hours-derived word
  // above is only a fallback for POIs without one.
  const opStatus = typeof poi?.status === 'string' && poi.status.trim() ? poi.status.trim() : null;
  if (opStatus) statusTopText = opStatus;
  const statusMessage =
    typeof poi?.status_message === 'string' && poi.status_message.trim() ? poi.status_message.trim() : null;
  const _statusSpace = statusLabel ? statusLabel.indexOf(' ') : -1;
  const statusLead = statusLabel ? (_statusSpace === -1 ? statusLabel : statusLabel.slice(0, _statusSpace)) : '';
  const statusRest = statusLabel && _statusSpace !== -1 ? statusLabel.slice(_statusSpace) : '';

  const countyName = poi?.address_county || poi?.county || 'Your Community';
  const updatedIso = poi?.last_updated || poi?.updated_at;
  const lastUpdatedStr = formatLastUpdated(updatedIso);

  return (
    <header className="page_header_poi_style_1">
      <div className="wrapper_default poi_intro_wrapper">

        <div className="poi_col1">
          {titleLeader}

          {!hideStatus && statusTopText && (
            <div className="poi_status">{statusTopText}</div>
          )}
          {!hideStatus && statusMessage && (
            <div className="poi_status_message">{statusMessage}</div>
          )}

          <div className="poi_intro">
            <h1 className="poi_page_title">{poi?.name}</h1>
            {mainCategory && <div className="poi_page_main_category">{mainCategory}</div>}
            {subtitleExtras}
            {locationLine && <div className="poi_intro_location">{locationLine}</div>}
            {statusCls && statusLabel && (
              <div className="poi_page_hours">
                <div className={statusCls}>
                  <span className="poi_page_hours_text">
                    <span className="poi_hours_status_word" style={{ color: statusWordColor }}>{statusLead}</span>{statusRest}
                  </span>
                </div>
                {poi?.hours && (
                  <div className="poi_page_hours_quick_show">
                    <button
                      type="button"
                      id="poi_page_hours_toggle"
                      className="btn_reset button"
                      onClick={() => setHoursExpanded((v) => !v)}
                      aria-expanded={hoursExpanded}
                      aria-controls="poi_hours_panel"
                    >
                      {hoursExpanded ? 'Hide hours' : 'Show all hours'}
                      <ChevronDown
                        size={14}
                        style={{ marginLeft: 4, transition: 'transform 0.2s', transform: hoursExpanded ? 'rotate(180deg)' : 'none' }}
                      />
                    </button>
                    {hoursExpanded && (
                      <div id="poi_hours_panel" className="poi_hours_panel box_style_1">
                        <HoursDisplay
                          hours={poi.hours}
                          appointmentBookingUrl={poi.appointment_booking_url}
                          appointmentRequired={poi.hours_but_appointment_required}
                          hoursNotes={poi.hours?.notes}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="poi_button_group_1">
            {!hideExact && coords && (
              <TealButton onClick={handleDirections}>
                <SvgDirections />
                <span className="poi_button_title">Directions</span>
              </TealButton>
            )}
            {!hideExact && coords && (
              <TealButton onClick={handleCopyLatLong}>
                <SvgLatLong />
                <span className="poi_button_title">{copiedCoords ? 'Copied!' : 'Lat + Long'}</span>
              </TealButton>
            )}
            {/* Server tier-gates phone_number/website_url in the payload, so the
                CTA self-hides for free tier without a client paid gate. */}
            {phoneHref && (
              <TealButton href={phoneHref} target="_self" rel="">
                <SvgCall />
                <span className="poi_button_title">Call</span>
              </TealButton>
            )}
            {webHref && (
              <TealButton href={webHref}>
                <SvgWebsite />
                <span className="poi_button_title">Website</span>
              </TealButton>
            )}

            {extraButtons.map((btn, i) => (
              <TealButton
                key={i}
                extraClass={btn.extraClass || ''}
                onClick={btn.onClick}
                href={btn.href}
                target={btn.target}
                rel={btn.rel}
              >
                {btn.svg}
                <span className="poi_button_title">{btn.label}</span>
              </TealButton>
            ))}

            <TealButton extraClass="btn_view_nearby" onClick={handleViewNearby}>
              <SvgNearby />
              <span className="poi_button_title">View Nearby</span>
            </TealButton>
            <TealButton extraClass="btn_share" onClick={handleShare}>
              <SvgShare />
              <span className="poi_button_title">Share</span>
            </TealButton>
          </div>
        </div>{/* end poi_col1 */}

        <div className="poi_col2">
          {typeInfoBox}

          {paid && poi?.is_verified && (
            <div className="poi_verified_box">
              <div className="poi_verified_badge button">
                <SvgVerified />
                <span className="poi_verified_badge_title">Verified</span>
              </div>
              <button
                id="whatsthis"
                type="button"
                className="btn_reset button poi_verified_badge_about"
                aria-expanded={tooltipOpen}
                onClick={() => setTooltipOpen((v) => !v)}
              >
                What's This
              </button>
              <div id="poi_verified_tooltip" className={`poi_verified_tooltip${tooltipOpen ? ' is_open' : ''}`}>
                <div className="poi_verified_tooltip_inner">
                  {poi?.poi_type === 'EVENT'
                    ? 'This event has been confirmed with the organizer or venue by a Nearby Nearby Team member.'
                    : 'This place has been checked and confirmed as accurate by a Nearby Nearby Team member.'}
                </div>
              </div>
            </div>
          )}

          {paid && poi?.is_sponsor && (
            <div className="poi_sponsor_box">
              <SvgSponsor />
              <span className="poi_sponsor_text">
                Supporting Local Discovery in {countyName}
              </span>
            </div>
          )}

          {lastUpdatedStr && (
            <div className="poi_last_updated">Last Updated: {lastUpdatedStr}</div>
          )}

          <button
            id="btn_suggest_edit"
            type="button"
            className="btn_reset button btn_outline_teal btn_poi_button_1 btn_trigger"
            aria-expanded="false"
            aria-controls="suggest_overlay"
            onClick={handleSuggestEdit}
          >
            <SvgPencil />
            <span className="poi_button_title">Suggest an Edit</span>
          </button>
        </div>{/* end poi_col2 */}

      </div>{/* end wrapper_default */}
    </header>
  );
}
