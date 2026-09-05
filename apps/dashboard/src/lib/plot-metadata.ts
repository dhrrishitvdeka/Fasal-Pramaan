export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi (NCT)",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

export const SOIL_TYPES = [
  { value: "Alluvial / Loam", labelEn: "Alluvial / Loam (दोमट)", labelHi: "दोमट / कछारी मिट्टी" },
  { value: "Clay / Heavy", labelEn: "Clay / Heavy (चिकनी)", labelHi: "चिकनी / मटियारी मिट्टी" },
  { value: "Sandy Loam", labelEn: "Sandy Loam (बलुई दोमट)", labelHi: "बलुई दोमट मिट्टी" },
  { value: "Black Cotton", labelEn: "Black Cotton (काली)", labelHi: "काली कपासी मिट्टी" },
  { value: "Red / Yellow", labelEn: "Red / Yellow (लाल-पीली)", labelHi: "लाल / पीली मिट्टी" },
  { value: "Laterite", labelEn: "Laterite (लैटेराइट)", labelHi: "लैटेराइट मिट्टी" },
] as const;

export const IRRIGATION_TYPES = [
  { value: "Tube-well", labelEn: "Tube-well / Borewell (नलकूप)", labelHi: "नलकूप / बोरवेल" },
  { value: "Canal", labelEn: "Canal (नहर)", labelHi: "नहर / राजकीय सिंचाई" },
  { value: "River Lift / Pond", labelEn: "River Lift / Pond (तालाब/नदी)", labelHi: "नदी / तालाब / लिफ्ट" },
  { value: "Rainfed", labelEn: "Rainfed / Barani (वर्षा आधारित)", labelHi: "वर्षा आधारित (बारानी)" },
  { value: "Drip / Sprinkler", labelEn: "Drip / Sprinkler (ड्रिप/फव्वारा)", labelHi: "ड्रिप / स्प्रिंकलर सिंचाई" },
] as const;

export const SUPPORTED_CROPS = [
  { value: "wheat", labelEn: "Wheat", labelHi: "गेहूँ (Wheat)" },
  { value: "paddy", labelEn: "Paddy / Rice", labelHi: "धान / चावल (Paddy)" },
  { value: "maize", labelEn: "Maize", labelHi: "मक्का (Maize)" },
  { value: "mustard", labelEn: "Mustard", labelHi: "सरसों (Mustard)" },
  { value: "potato", labelEn: "Potato", labelHi: "आलू (Potato)" },
  { value: "sugarcane", labelEn: "Sugarcane", labelHi: "गन्ना (Sugarcane)" },
  { value: "cotton", labelEn: "Cotton", labelHi: "कपास (Cotton)" },
  { value: "soybean", labelEn: "Soybean", labelHi: "सोयाबीन (Soybean)" },
  { value: "gram", labelEn: "Gram (Chickpea)", labelHi: "चना (Gram)" },
  { value: "groundnut", labelEn: "Groundnut", labelHi: "मूंगफली (Groundnut)" },
  { value: "onion", labelEn: "Onion", labelHi: "प्याज़ (Onion)" },
  { value: "pulses", labelEn: "Pulses / Dal", labelHi: "दालें (Pulses)" },
] as const;

export const CROP_SEASONS = [
  { value: "Rabi", labelEn: "Rabi (Winter Season)", labelHi: "रबी (शीतकालीन)" },
  { value: "Kharif", labelEn: "Kharif (Monsoon Season)", labelHi: "खरीफ (मानसूनी)" },
  { value: "Zaid", labelEn: "Zaid (Summer Season)", labelHi: "जायद (ग्रीष्मकालीन)" },
] as const;

export const TENANCY_TYPES = [
  { value: "owner", labelEn: "Owner / Self-Cultivated", labelHi: "खुदकाश्त (भू-स्वामी / Owner)" },
  { value: "tenant", labelEn: "Tenant / Cash Leased", labelHi: "काश्तकार (किरायेदार / Tenant)" },
  { value: "sharecropper", labelEn: "Sharecropper / Batai", labelHi: "बटाईदार (Sharecropper)" },
] as const;
