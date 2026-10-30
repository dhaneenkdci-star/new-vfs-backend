const GOING_TO_COUNTRIES = [
  { "code": "DZ", "name": "Algeria", "flag": "🇩🇿" },
  { "code": "AU", "name": "Australia", "flag": "🇦🇺" },
  { "code": "AT", "name": "Austria", "flag": "🇦🇹" },
  { "code": "AZ", "name": "Azerbaijan", "flag": "🇦🇿" },
  { "code": "BE", "name": "Belgium", "flag": "🇧🇪" },
  { "code": "BR", "name": "Brazil", "flag": "🇧🇷" },
  { "code": "BG", "name": "Bulgaria", "flag": "🇧🇬" },
  { "code": "CA", "name": "Canada", "flag": "🇨🇦" },
  { "code": "CN", "name": "China", "flag": "🇨🇳" },
  { "code": "HR", "name": "Croatia", "flag": "🇭🇷" },
  { "code": "CY", "name": "Cyprus", "flag": "🇨🇾" },
  { "code": "CZ", "name": "Czechia", "flag": "🇨🇿" },
  { "code": "DK", "name": "Denmark", "flag": "🇩🇰" },
  { "code": "DO", "name": "Dominican Republic", "flag": "🇩🇴" },
  { "code": "EE", "name": "Estonia", "flag": "🇪🇪" },
  { "code": "EG", "name": "Egypt", "flag": "🇪🇬" },
  { "code": "GQ", "name": "Equatorial Guinea", "flag": "🇬🇶" },
  { "code": "FI", "name": "Finland", "flag": "🇫🇮" },
  { "code": "FO", "name": "Faroe Islands", "flag": "🇫🇴" },
  { "code": "FR", "name": "France", "flag": "🇫🇷" },
  { "code": "GE", "name": "Georgia", "flag": "🇬🇪" },
  { "code": "DE", "name": "Germany", "flag": "🇩🇪" },
  { "code": "GR", "name": "Greece", "flag": "🇬🇷" },
  { "code": "GL", "name": "Greenland", "flag": "🇬🇱" },
  { "code": "HU", "name": "Hungary", "flag": "🇭🇺" },
  { "code": "IS", "name": "Iceland", "flag": "🇮🇸" },
  { "code": "ID", "name": "Indonesia", "flag": "🇮🇩" },
  { "code": "IN", "name": "India", "flag": "🇮🇳" },
  { "code": "IE", "name": "Ireland", "flag": "🇮🇪" },
  { "code": "IT", "name": "Italy", "flag": "🇮🇹" },
  { "code": "JP", "name": "Japan", "flag": "🇯🇵" },
  { "code": "LV", "name": "Latvia", "flag": "🇱🇻" },
  { "code": "LI", "name": "Liechtenstein", "flag": "🇱🇮" },
  { "code": "LB", "name": "Lebanon", "flag": "🇱🇧" },
  { "code": "LT", "name": "Lithuania", "flag": "🇱🇹" },
  { "code": "LU", "name": "Luxembourg", "flag": "🇱🇺" },
  { "code": "MY", "name": "Malaysia", "flag": "🇲🇾" },
  { "code": "MT", "name": "Malta", "flag": "🇲🇹" },
  { "code": "MD", "name": "Moldova", "flag": "🇲🇩" },
  { "code": "ME", "name": "Montenegro", "flag": "🇲🇪" },
  { "code": "MA", "name": "Morocco", "flag": "🇲🇦" },
  { "code": "NL", "name": "Netherlands", "flag": "🇳🇱" },
  { "code": "NZ", "name": "New Zealand", "flag": "🇳🇿" },
  { "code": "NG", "name": "Nigeria", "flag": "🇳🇬" },
  { "code": "NO", "name": "Norway", "flag": "🇳🇴" },
  { "code": "PL", "name": "Poland", "flag": "🇵🇱" },
  { "code": "PT", "name": "Portugal", "flag": "🇵🇹" },
  { "code": "RO", "name": "Romania", "flag": "🇷🇴" },
  { "code": "RU", "name": "Russia", "flag": "🇷🇺" },
  { "code": "SA", "name": "Saudi Arabia", "flag": "🇸🇦" },
  { "code": "SG", "name": "Singapore", "flag": "🇸🇬" },
  { "code": "SK", "name": "Slovakia", "flag": "🇸🇰" },
  { "code": "SI", "name": "Slovenia", "flag": "🇸🇮" },
  { "code": "ZA", "name": "South Africa", "flag": "🇿🇦" },
  { "code": "KR", "name": "South Korea", "flag": "🇰🇷" },
  { "code": "ES", "name": "Spain", "flag": "🇪🇸" },
  { "code": "SR", "name": "Suriname", "flag": "🇸🇷" },
  { "code": "SE", "name": "Sweden", "flag": "🇸🇪" },
  { "code": "CH", "name": "Switzerland", "flag": "🇨🇭" },
  { "code": "TH", "name": "Thailand", "flag": "🇹🇭" },
  { "code": "TR", "name": "Turkey", "flag": "🇹🇷" },
  { "code": "UA", "name": "Ukraine", "flag": "🇺🇦" },
  { "code": "AE", "name": "United Arab Emirates", "flag": "🇦🇪" },
  { "code": "GB", "name": "United Kingdom", "flag": "🇬🇧" },
  { "code": "US", "name": "United States of America", "flag": "🇺🇸" },
  { "code": "VN", "name": "Vietnam", "flag": "🇻🇳" }
];

const CENTRES_CONFIG = {
  "A": [
    { name: "Algeria visa application center", code: "DZ", cities: ["Mumbai", "Delhi"] },
    { name: "Australia visa application center", code: "AU", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Austria visa application center", code: "AT", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Azerbaijan visa application center", code: "AZ", cities: ["Mumbai", "Delhi"], suffix: " (Also online eVisa support)" }
  ],
  "B": [
    { name: "Belgium visa application center", code: "BE", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Bulgaria visa application center", code: "BG", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "C": [
    { name: "Canada visa application center", code: "CA", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "China visa application center", code: "CN", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Croatia visa application center", code: "HR", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Cyprus visa application center", code: "CY", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Czech Republic visa application center", code: "CZ", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "D": [
    { name: "Denmark visa application center", code: "DK", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Dominican Republic visa application center", code: "DO", cities: ["Chennai", "Mumbai", "Delhi"] }
  ],
  "E": [
    { name: "Egypt visa application center", code: "EG", cities: ["Mumbai", "Delhi"] },
    { name: "Equatorial Guinea visa application center", code: "GQ", cities: ["Delhi"], suffix: " (Primarily electronic process support)" },
    { name: "Estonia visa application center", code: "EE", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "F": [
    { name: "Faroe Islands visa application center", code: "FO", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"], suffix: " (Processed via Denmark VAC)" },
    { name: "Finland visa application center", code: "FI", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Finland Residence Permit center", code: "FI", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "France visa application center", code: "FR", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "G": [
    { name: "Georgia visa application center", code: "GE", cities: ["Mumbai", "Delhi"] },
    { name: "Germany visa application center", code: "DE", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Greece visa application center", code: "GR", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Greenland visa application center", code: "GL", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"], suffix: " (Processed via Denmark VAC)" }
  ],
  "H": [
    { name: "Hungary visa application center", code: "HU", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "I": [
    { name: "Iceland visa application center", code: "IS", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Indonesia eVOA support center", code: "ID", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"], suffix: " (Most processes are online, but physical support hubs exist)" },
    { name: "Ireland visa application center", code: "IE", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Italy visa application center", code: "IT", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "J": [
    { name: "Japan visa application center", code: "JP", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "K": [
    { name: "Korea visa application center", code: "KR", cities: ["Chennai", "Mumbai", "New Delhi"], suffix: " (KVAC centers)" }
  ],
  "L": [
    { name: "Latvia visa application center", code: "LV", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Lebanon visa application center", code: "LB", cities: ["Mumbai", "Delhi"] },
    { name: "Lithuania visa application center", code: "LT", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Lithuania TRP and National Visa center", code: "LT", cities: ["Chennai", "Mumbai", "Bengaluru", "Delhi"] },
    { name: "Luxembourg visa application center", code: "LU", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "M": [
    { name: "Malta Long Stay Visa center", code: "MT", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Malta Short Stay Visa center", code: "MT", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Moldova visa application center", code: "MD", cities: ["Mumbai", "Delhi"] },
    { name: "Montenegro visa application center", code: "ME", cities: ["Mumbai", "Delhi"] },
    { name: "Morocco visa application center", code: "MA", cities: ["Mumbai", "Delhi"] }
  ],
  "N": [
    { name: "New Zealand visa application center", code: "NZ", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Norway visa application center", code: "NO", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "P": [
    { name: "Poland visa application center", code: "PL", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Portugal visa application center", code: "PT", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "S": [
    { name: "Saudi Arabia visa application center", code: "SA", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"], suffix: " (Tasheer Centers)" },
    { name: "Singapore visa application center", code: "SG", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Slovakia visa application center", code: "SK", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Slovenia visa application center", code: "SI", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "South Africa visa application center", code: "ZA", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Suriname visa application center", code: "SR", cities: ["Mumbai", "Delhi"], suffix: " (Electronic support desk)" },
    { name: "Sweden visa application center", code: "SE", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Switzerland visa application center", code: "CH", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] }
  ],
  "T": [
    { name: "Thailand visa application center", code: "TH", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "The Netherlands visa application center", code: "NL", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "Turkiye visa application center", code: "TR", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"], suffix: " (Gateway Globe / VFS)" }
  ],
  "U": [
    { name: "Ukraine visa application center", code: "UA", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"] },
    { name: "United Arab Emirates visa application center", code: "AE", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"], suffix: " (DVPC / VFS hubs)" },
    { name: "United Kingdom visa application center", code: "GB", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi", "London"] },
    { name: "United States of America visa application center", code: "US", cities: ["Chennai", "Mumbai", "Hyderabad", "Bengaluru", "Delhi"], suffix: " (Biometric VACs)" }
  ]
};

module.exports = {
  GOING_TO_COUNTRIES,
  CENTRES_CONFIG
};
