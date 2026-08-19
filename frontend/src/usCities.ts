/** A small curated set of well-known cities per state — the state capital
plus that state's largest/best-known cities, ~5 per state (DC only has one
real "city" to offer). Used purely as the post-a-load form's city
`Combobox` (LoadsPage.tsx's `LocationFields`) initial option list, shown on
focus before the user has typed a single character.

Why this exists instead of just asking Photon for "the cities in <state>":
tried it and it doesn't work. Querying Photon with only the state name
(e.g. `q=Texas`, no city term) returns the state region itself and
same-named counties in *other* states (e.g. "Texas County, Missouri"), not
a useful city list — and placeSearch.ts's own cross-check against the
selected state would filter that state-region result out anyway, since it
has no `state` property of its own. Querying with no `q` at all (browsing
by category within a bounding box) isn't supported on Photon's public
instance either — it 400s with "q parameter is required when no include
categories are specified". So there is no way to get live, server-side
"cities in this state" results before the user types something; this
static list is what fills that specific gap.

The moment the user types even one character, this list stops being used —
`LocationFields`'s `search` callback falls through to placeSearch.ts's live,
debounced Photon search exactly as before, over every real city/town/
village Photon knows, not just the handful curated here.

Same spirit as usLocations.ts: small, fixed, well-known names, no live
lookup needed for something this unambiguous. Data-accuracy bar: state
capitals and each state's largest cities are well-established public
knowledge, spot-checked against known population rankings before
committing — not obscure trivia. */

export const US_CITIES: Record<string, string[]> = {
  AL: ["Birmingham", "Montgomery", "Huntsville", "Mobile", "Tuscaloosa"],
  AK: ["Anchorage", "Juneau", "Fairbanks", "Sitka", "Ketchikan"],
  AZ: ["Phoenix", "Tucson", "Mesa", "Chandler", "Scottsdale"],
  AR: ["Little Rock", "Fayetteville", "Fort Smith", "Springdale", "Jonesboro"],
  CA: ["Los Angeles", "San Diego", "San Jose", "San Francisco", "Sacramento"],
  CO: ["Denver", "Colorado Springs", "Aurora", "Fort Collins", "Boulder"],
  CT: ["Bridgeport", "New Haven", "Hartford", "Stamford", "Waterbury"],
  DE: ["Wilmington", "Dover", "Newark", "Middletown", "Smyrna"],
  DC: ["Washington"],
  FL: ["Jacksonville", "Miami", "Tampa", "Orlando", "Tallahassee"],
  GA: ["Atlanta", "Augusta", "Columbus", "Savannah", "Athens"],
  HI: ["Honolulu", "Hilo", "Kailua", "Kaneohe", "Waipahu"],
  ID: ["Boise", "Meridian", "Nampa", "Idaho Falls", "Pocatello"],
  IL: ["Chicago", "Aurora", "Naperville", "Springfield", "Rockford"],
  IN: ["Indianapolis", "Fort Wayne", "Evansville", "South Bend", "Carmel"],
  IA: ["Des Moines", "Cedar Rapids", "Davenport", "Sioux City", "Iowa City"],
  KS: ["Wichita", "Overland Park", "Kansas City", "Topeka", "Olathe"],
  KY: ["Louisville", "Lexington", "Bowling Green", "Frankfort", "Owensboro"],
  LA: ["New Orleans", "Baton Rouge", "Shreveport", "Lafayette", "Lake Charles"],
  ME: ["Portland", "Lewiston", "Bangor", "Augusta", "South Portland"],
  MD: ["Baltimore", "Columbia", "Germantown", "Annapolis", "Frederick"],
  MA: ["Boston", "Worcester", "Springfield", "Cambridge", "Lowell"],
  MI: ["Detroit", "Grand Rapids", "Warren", "Ann Arbor", "Lansing"],
  MN: ["Minneapolis", "Saint Paul", "Rochester", "Duluth", "Bloomington"],
  MS: ["Jackson", "Gulfport", "Southaven", "Hattiesburg", "Biloxi"],
  MO: ["Kansas City", "Saint Louis", "Springfield", "Columbia", "Jefferson City"],
  MT: ["Billings", "Missoula", "Great Falls", "Bozeman", "Helena"],
  NE: ["Omaha", "Lincoln", "Bellevue", "Grand Island", "Kearney"],
  NV: ["Las Vegas", "Henderson", "Reno", "North Las Vegas", "Carson City"],
  NH: ["Manchester", "Nashua", "Concord", "Dover", "Rochester"],
  NJ: ["Newark", "Jersey City", "Paterson", "Trenton", "Elizabeth"],
  NM: ["Albuquerque", "Las Cruces", "Rio Rancho", "Santa Fe", "Roswell"],
  NY: ["New York City", "Buffalo", "Rochester", "Yonkers", "Albany"],
  NC: ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem"],
  ND: ["Fargo", "Bismarck", "Grand Forks", "Minot", "West Fargo"],
  OH: ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron"],
  OK: ["Oklahoma City", "Tulsa", "Norman", "Broken Arrow", "Edmond"],
  OR: ["Portland", "Salem", "Eugene", "Gresham", "Hillsboro"],
  PA: ["Philadelphia", "Pittsburgh", "Allentown", "Erie", "Harrisburg"],
  RI: ["Providence", "Cranston", "Warwick", "Pawtucket", "East Providence"],
  SC: ["Columbia", "Charleston", "North Charleston", "Mount Pleasant", "Rock Hill"],
  SD: ["Sioux Falls", "Rapid City", "Aberdeen", "Brookings", "Pierre"],
  TN: ["Nashville", "Memphis", "Knoxville", "Chattanooga", "Clarksville"],
  TX: ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth"],
  UT: ["Salt Lake City", "West Valley City", "Provo", "West Jordan", "Orem"],
  VT: ["Burlington", "South Burlington", "Rutland", "Montpelier", "Barre"],
  VA: ["Virginia Beach", "Norfolk", "Chesapeake", "Richmond", "Arlington"],
  WA: ["Seattle", "Spokane", "Tacoma", "Vancouver", "Olympia"],
  WV: ["Charleston", "Huntington", "Morgantown", "Parkersburg", "Wheeling"],
  WI: ["Milwaukee", "Madison", "Green Bay", "Kenosha", "Racine"],
  WY: ["Cheyenne", "Casper", "Laramie", "Gillette", "Rock Springs"],
};
