export type Zone = "itp" | "north_otp" | "south" | "west" | "east" | "other";
export type LeadType = "buyer" | "seller" | "buysell";
export type Source = "isa" | "osa" | "self";

export interface Agent {
  id: string;
  name: string;
  role: "partner" | "jr_partner" | "agent" | "refer_out";
  buyerFloor: number;
  buyerMax: number | null;
  sellerFloor: number;
  sellerMax: number | null;
  listingEligible: boolean;
  listingOrder: number | null;
  monthlyCapISA: number;
  zones: Zone[];
  zoneFlags: Zone[];
  devCommunities: string[];
  buyerOnly: boolean;
  listingsOnly: boolean;
  takesRentals: boolean;
  conversionOverall: number | null;
  conversionListing: number | null;
  notes: string;
  active: boolean;
  onVacation: boolean;
  returnDate: string | null;
  provisional: boolean;
  referOut?: boolean;
  comingSoon?: boolean;
  listingToggleSoon?: boolean;
}

export const ZONES: { id: Zone; label: string }[] = [
  { id: "itp",       label: "Intown / ITP" },
  { id: "north_otp", label: "North OTP (Roswell, Alpharetta, Marietta, Canton)" },
  { id: "south",     label: "South (Peachtree City, Newnan, Fayetteville, Jonesboro)" },
  { id: "west",      label: "West Corridor (Douglasville, Lithia Springs, Austell)" },
  { id: "east",      label: "East (Decatur, Stone Mountain, Conyers)" },
  { id: "other",     label: "Other / Unknown" },
];

export const DEV_COMMUNITIES = [
  { id: "brookglen",     label: "Brookglen Heights" },
  { id: "grand_terraza", label: "Grand Terraza" },
  { id: "blvd_heights",  label: "Blvd Heights" },
];

export const PASS_REASONS = [
  { id: "capacity",    label: "At capacity" },
  { id: "unavailable", label: "Unavailable / scheduling conflict" },
  { id: "area",        label: "Outside service area" },
  { id: "price_range", label: "Outside price range" },
  { id: "cherry_pick", label: "No clear reason (cherry-pick flag)" },
  { id: "other",       label: "Other legitimate reason" },
];

export const SUB250K_POOL = ["valerie", "darrell", "justin", "kami"];

// Order reflects last handoff dates as of 6/30 — earliest first = first up July 1
export const INITIAL_AGENTS: Agent[] = [
  { id: "raegan",    name: "Raegan",    role: "agent",
    buyerFloor: 400000, buyerMax: 1000000, sellerFloor: 0, sellerMax: 750000,
    listingEligible: true, listingOrder: null, monthlyCapISA: 8,
    zones: ["north_otp","east"], zoneFlags: ["itp","south","west"],
    devCommunities: [], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: 17, conversionListing: null,
    notes: "OSA-sourced primarily. Dashboard compliance issues. North/East areas. Watch cherry-picking.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "lauren",    name: "Lauren",    role: "jr_partner",
    buyerFloor: 400000, buyerMax: null, sellerFloor: 400000, sellerMax: null,
    listingEligible: true, listingOrder: 2, monthlyCapISA: 12,
    zones: ["itp","south","west"], zoneFlags: ["north_otp"],
    devCommunities: [], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: 19, conversionListing: 20,
    notes: "Jr partner. Listing order #2. Prefers listings. Very seasoned.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "valerie",   name: "Valerie",   role: "agent",
    buyerFloor: 0, buyerMax: 250000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 4,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: true, listingsOnly: false, takesRentals: true,
    conversionOverall: null, conversionListing: null,
    notes: "<$250k + rentals.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "caroline",  name: "Caroline",  role: "agent",
    buyerFloor: 400000, buyerMax: 1000000, sellerFloor: 0, sellerMax: 550000,
    listingEligible: true, listingOrder: null, monthlyCapISA: 6,
    zones: ["itp","east","north_otp"], zoneFlags: ["south"],
    devCommunities: [], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: 19, conversionListing: 23,
    notes: "Experienced but picky. 4-6 leads/mo. Virginia Highlands, Vinings, Brookhaven.",
    active: true, onVacation: true, returnDate: "2026-07-06", provisional: false },
  { id: "james",     name: "James",     role: "agent",
    buyerFloor: 251000, buyerMax: 500000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 4,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: true, listingsOnly: false, takesRentals: false,
    conversionOverall: 18, conversionListing: null,
    notes: "Limited drive. Backed off leads. Buyers only <$500k.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "gary",      name: "Gary",      role: "agent",
    buyerFloor: 251000, buyerMax: 500000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 6,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: true, listingsOnly: false, takesRentals: false,
    conversionOverall: 15, conversionListing: null,
    notes: "Hyper energy, early career. Buyers only <$500k. Listing training not yet scheduled.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "kandance",  name: "Kandance",  role: "agent",
    buyerFloor: 251000, buyerMax: 500000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 6,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: ["brookglen"], buyerOnly: true, listingsOnly: false, takesRentals: false,
    conversionOverall: null, conversionListing: null,
    notes: "New to team (Aug '25). 65% appt kept but pipeline issues. Buyers <$500k.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "lucy",      name: "Lucy",      role: "agent",
    buyerFloor: 251000, buyerMax: 500000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 6,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: true, listingsOnly: false, takesRentals: false,
    conversionOverall: null, conversionListing: null,
    notes: "Baby agent (<20 yrs). Be mindful of client pairing. 46% appt kept.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "kyle",      name: "Kyle",      role: "agent",
    buyerFloor: 300000, buyerMax: 750000, sellerFloor: 0, sellerMax: 500000,
    listingEligible: true, listingOrder: null, monthlyCapISA: 12,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: ["brookglen"], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: 21, conversionListing: 18,
    notes: "Crushing it early career. Buyers <$750k, sellers <$500k. Brookglen Heights.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "stephanie", name: "Stephanie", role: "agent",
    buyerFloor: 251000, buyerMax: 500000, sellerFloor: 0, sellerMax: 500000,
    listingEligible: true, listingOrder: null, monthlyCapISA: 6,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: ["brookglen"], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: null, conversionListing: null,
    notes: "Brand new Jan '26, crushing it! 62% appt kept. Developing listing agent <$400k. Brookglen Heights.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "darrell",   name: "Darrell",   role: "agent",
    buyerFloor: 0, buyerMax: 250000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 4,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: true, listingsOnly: false, takesRentals: true,
    conversionOverall: null, conversionListing: null,
    notes: "<$250k + rentals.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "micahia",   name: "Micahia",   role: "agent",
    buyerFloor: 400000, buyerMax: 1000000, sellerFloor: 0, sellerMax: 500000,
    listingEligible: true, listingOrder: null, monthlyCapISA: 8,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: 21, conversionListing: 15,
    notes: "4th year. Higher give-back rate than average. Working on price point floor.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "paige",     name: "Paige",     role: "agent",
    buyerFloor: 400000, buyerMax: 2000000, sellerFloor: 0, sellerMax: 750000,
    listingEligible: true, listingOrder: null, monthlyCapISA: 4,
    zones: ["north_otp"], zoneFlags: ["itp","south","west","east"],
    devCommunities: [], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: 20, conversionListing: 15,
    notes: "Exp. agent, part-time marketing. Low capacity (4/mo). North suburbs only.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "savy",      name: "Savy",      role: "agent",
    buyerFloor: 300000, buyerMax: 750000, sellerFloor: 300000, sellerMax: 750000,
    listingEligible: true, listingOrder: null, monthlyCapISA: 8,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: ["brookglen"], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: 17, conversionListing: 7,
    notes: "3 yrs, new to JLG Aug '25. Struggling. $300k floor. Brookglen Heights.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "chanel",    name: "Chanel",    role: "agent",
    buyerFloor: 251000, buyerMax: 500000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 6,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: ["grand_terraza"], buyerOnly: true, listingsOnly: false, takesRentals: true,
    conversionOverall: null, conversionListing: null,
    notes: "New Jan '26, from NJ. Pipeline issues despite 56% appt kept. Takes rentals. Grand Terraza pool.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "kalen",     name: "Kalen",     role: "agent",
    buyerFloor: 251000, buyerMax: 750000, sellerFloor: 0, sellerMax: 350000,
    listingEligible: false, listingOrder: null, monthlyCapISA: 8,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: true, listingsOnly: false, takesRentals: false,
    conversionOverall: 22, conversionListing: null,
    notes: "New agent (Sep '25). Listing toggle coming soon. Lives north suburbs, will drive.",
    active: true, onVacation: false, returnDate: null, provisional: false, listingToggleSoon: true },
  { id: "ian",       name: "Ian",       role: "agent",
    buyerFloor: 251000, buyerMax: 500000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 6,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: true, listingsOnly: false, takesRentals: false,
    conversionOverall: null, conversionListing: null,
    notes: "Super new (Mar '26). 45% appt kept, already closed 1 team lead.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "ashton",    name: "Ashton",    role: "partner",
    buyerFloor: 400000, buyerMax: null, sellerFloor: 400000, sellerMax: null,
    listingEligible: true, listingOrder: 1, monthlyCapISA: 17,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: false, listingsOnly: true, takesRentals: false,
    conversionOverall: 31, conversionListing: 28,
    notes: "Partner. First crack at all listings $400k+. Listings only — excluded from buyer rotation. Eligible for buy/sell.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "lisa",      name: "Lisa",      role: "agent",
    buyerFloor: 300000, buyerMax: 1000000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 8,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: true, listingsOnly: false, takesRentals: false,
    conversionOverall: 25, conversionListing: null,
    notes: "3rd yr. High conversion (25%) but low motivation. Buyers <$1m.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "khadeen",   name: "Khadeen",   role: "agent",
    buyerFloor: 300000, buyerMax: 750000, sellerFloor: 0, sellerMax: 500000,
    listingEligible: true, listingOrder: null, monthlyCapISA: 8,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: ["blvd_heights"], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: 19, conversionListing: 7,
    notes: "2nd year. Buyers <$750k, sellers <$500k. Blvd Heights pool.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "rae",       name: "Rae",       role: "agent",
    buyerFloor: 251000, buyerMax: 500000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 6,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: ["brookglen"], buyerOnly: true, listingsOnly: false, takesRentals: false,
    conversionOverall: null, conversionListing: null,
    notes: "New (Oct '25). 47% appt kept. Watch cherry-picking.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "riley",     name: "Riley",     role: "agent",
    buyerFloor: 251000, buyerMax: 500000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 6,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: ["brookglen"], buyerOnly: true, listingsOnly: false, takesRentals: true,
    conversionOverall: null, conversionListing: null,
    notes: "Brand new (Jan '26). 75% appt kept. 1 closed team lead. Takes rentals.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "casey",     name: "Casey",     role: "partner",
    buyerFloor: 350000, buyerMax: null, sellerFloor: 400000, sellerMax: null,
    listingEligible: true, listingOrder: 3, monthlyCapISA: 12,
    zones: ["itp","north_otp"], zoneFlags: ["south","west"],
    devCommunities: [], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: 33, conversionListing: 27,
    notes: "Partner. Listing order #3. Prefers buyers. Intown/Decatur + North suburbs.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "jamique",   name: "Jamique",   role: "agent",
    buyerFloor: 350000, buyerMax: 1000000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 6,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: true, listingsOnly: false, takesRentals: false,
    conversionOverall: 25, conversionListing: null,
    notes: "3-4 yrs exp. Lower volume by choice. Buyers <$1m.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "enya",      name: "Enya",      role: "agent",
    buyerFloor: 300000, buyerMax: 1000000, sellerFloor: 0, sellerMax: 500000,
    listingEligible: true, listingOrder: null, monthlyCapISA: 8,
    zones: ["itp","south"], zoneFlags: ["north_otp"],
    devCommunities: [], buyerOnly: false, listingsOnly: false, takesRentals: false,
    conversionOverall: 20, conversionListing: null,
    notes: "2nd year. Strong first year ($100k). Listing conversion TBD. Intown + Peachtree City.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "kami",      name: "Kami",      role: "agent",
    buyerFloor: 0, buyerMax: 250000, sellerFloor: 0, sellerMax: null,
    listingEligible: false, listingOrder: null, monthlyCapISA: 4,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: true, listingsOnly: false, takesRentals: true,
    conversionOverall: null, conversionListing: null,
    notes: "<$250k + rentals.",
    active: true, onVacation: false, returnDate: null, provisional: false },
  { id: "justin",    name: "Justin (Refer Out)", role: "refer_out",
    buyerFloor: 0, buyerMax: 250000, sellerFloor: 0, sellerMax: 250000,
    listingEligible: false, listingOrder: null, monthlyCapISA: 999,
    zones: ["itp","north_otp","south","west","east","other"], zoneFlags: [],
    devCommunities: [], buyerOnly: false, listingsOnly: false, takesRentals: true,
    conversionOverall: null, conversionListing: null,
    notes: "Not a team agent — refers out leads under $250k.",
    active: true, onVacation: false, returnDate: null, provisional: false, referOut: true },
];

export function buildRotation(agents: Agent[], type: "buyer" | "listing"): string[] {
  if (type === "listing") {
    const eligible = agents.filter(a => a.listingEligible);
    const ordered = eligible.filter(a => a.listingOrder !== null).sort((a, b) => a.listingOrder! - b.listingOrder!);
    const rest = eligible.filter(a => a.listingOrder === null);
    return [...ordered, ...rest].map(a => a.id);
  }
  return agents.filter(a => !a.listingsOnly).map(a => a.id);
}

export function formatPrice(v: number | null): string {
  if (v === null || v === undefined) return "No cap";
  if (v >= 1000000) return `$${v / 1000000}M`;
  return `$${(v / 1000).toFixed(0)}k`;
}
