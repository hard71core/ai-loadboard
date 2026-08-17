/** A fixed reference list of US states + a handful of major cities each —
not a live lookup, deliberately. The post-a-load form used to take origin/
destination as free text ("City, ST"), which meant a typo or an unusual
spelling would geocode wrong or not at all on the detail page's map
(frontend/src/geocode.ts) and the ETA estimate (backend/app/core/eta.py) —
both go through Nominatim, which has no fuzzy correction. Picking from this
list instead guarantees every posted load's origin/destination is a real,
correctly-spelled "City, ST" pair that those two features can always
resolve.

Deliberately not exhaustive — a handful of the largest/best-known cities
per state, not every incorporated place. That's enough to cover realistic
freight lanes for a demo without pretending to be a full US gazetteer;
extending a state's list is just adding strings to its `cities` array, no
other code needs to know about it. */

export interface USState {
  code: string;
  name: string;
  cities: string[];
}

export const US_STATES: USState[] = [
  { code: "AL", name: "Alabama", cities: ["Birmingham", "Huntsville", "Mobile", "Montgomery", "Tuscaloosa"] },
  { code: "AK", name: "Alaska", cities: ["Anchorage", "Fairbanks", "Juneau"] },
  { code: "AZ", name: "Arizona", cities: ["Chandler", "Mesa", "Phoenix", "Scottsdale", "Tucson"] },
  { code: "AR", name: "Arkansas", cities: ["Fayetteville", "Fort Smith", "Little Rock"] },
  {
    code: "CA",
    name: "California",
    cities: [
      "Fresno",
      "Long Beach",
      "Los Angeles",
      "Oakland",
      "Sacramento",
      "San Diego",
      "San Francisco",
      "San Jose",
    ],
  },
  { code: "CO", name: "Colorado", cities: ["Aurora", "Colorado Springs", "Denver", "Fort Collins"] },
  { code: "CT", name: "Connecticut", cities: ["Bridgeport", "Hartford", "New Haven", "Stamford"] },
  { code: "DE", name: "Delaware", cities: ["Dover", "Newark", "Wilmington"] },
  { code: "DC", name: "District of Columbia", cities: ["Washington"] },
  {
    code: "FL",
    name: "Florida",
    cities: ["Fort Lauderdale", "Jacksonville", "Miami", "Orlando", "St. Petersburg", "Tampa"],
  },
  { code: "GA", name: "Georgia", cities: ["Atlanta", "Augusta", "Columbus", "Macon", "Savannah"] },
  { code: "HI", name: "Hawaii", cities: ["Hilo", "Honolulu", "Kailua"] },
  { code: "ID", name: "Idaho", cities: ["Boise", "Idaho Falls", "Meridian", "Nampa"] },
  { code: "IL", name: "Illinois", cities: ["Aurora", "Chicago", "Joliet", "Naperville", "Springfield"] },
  { code: "IN", name: "Indiana", cities: ["Evansville", "Fort Wayne", "Indianapolis", "South Bend"] },
  { code: "IA", name: "Iowa", cities: ["Cedar Rapids", "Davenport", "Des Moines", "Sioux City"] },
  { code: "KS", name: "Kansas", cities: ["Kansas City", "Overland Park", "Topeka", "Wichita"] },
  { code: "KY", name: "Kentucky", cities: ["Bowling Green", "Lexington", "Louisville"] },
  { code: "LA", name: "Louisiana", cities: ["Baton Rouge", "Lafayette", "New Orleans", "Shreveport"] },
  { code: "ME", name: "Maine", cities: ["Bangor", "Lewiston", "Portland"] },
  { code: "MD", name: "Maryland", cities: ["Annapolis", "Baltimore", "Frederick", "Rockville"] },
  { code: "MA", name: "Massachusetts", cities: ["Boston", "Cambridge", "Springfield", "Worcester"] },
  { code: "MI", name: "Michigan", cities: ["Ann Arbor", "Detroit", "Grand Rapids", "Lansing", "Warren"] },
  { code: "MN", name: "Minnesota", cities: ["Duluth", "Minneapolis", "Rochester", "Saint Paul"] },
  { code: "MS", name: "Mississippi", cities: ["Gulfport", "Jackson", "Southaven"] },
  { code: "MO", name: "Missouri", cities: ["Columbia", "Kansas City", "Springfield", "St. Louis"] },
  { code: "MT", name: "Montana", cities: ["Billings", "Great Falls", "Missoula"] },
  { code: "NE", name: "Nebraska", cities: ["Bellevue", "Lincoln", "Omaha"] },
  { code: "NV", name: "Nevada", cities: ["Carson City", "Henderson", "Las Vegas", "Reno"] },
  { code: "NH", name: "New Hampshire", cities: ["Concord", "Manchester", "Nashua"] },
  { code: "NJ", name: "New Jersey", cities: ["Jersey City", "Newark", "Paterson", "Trenton"] },
  { code: "NM", name: "New Mexico", cities: ["Albuquerque", "Las Cruces", "Santa Fe"] },
  {
    code: "NY",
    name: "New York",
    cities: ["Albany", "Buffalo", "New York", "Rochester", "Syracuse", "Yonkers"],
  },
  {
    code: "NC",
    name: "North Carolina",
    cities: ["Charlotte", "Durham", "Greensboro", "Raleigh", "Winston-Salem"],
  },
  { code: "ND", name: "North Dakota", cities: ["Bismarck", "Fargo", "Grand Forks"] },
  { code: "OH", name: "Ohio", cities: ["Akron", "Cincinnati", "Cleveland", "Columbus", "Dayton", "Toledo"] },
  { code: "OK", name: "Oklahoma", cities: ["Norman", "Oklahoma City", "Tulsa"] },
  { code: "OR", name: "Oregon", cities: ["Bend", "Eugene", "Portland", "Salem"] },
  { code: "PA", name: "Pennsylvania", cities: ["Allentown", "Erie", "Harrisburg", "Philadelphia", "Pittsburgh"] },
  { code: "RI", name: "Rhode Island", cities: ["Cranston", "Providence", "Warwick"] },
  { code: "SC", name: "South Carolina", cities: ["Charleston", "Columbia", "Greenville"] },
  { code: "SD", name: "South Dakota", cities: ["Pierre", "Rapid City", "Sioux Falls"] },
  { code: "TN", name: "Tennessee", cities: ["Chattanooga", "Knoxville", "Memphis", "Nashville"] },
  {
    code: "TX",
    name: "Texas",
    cities: ["Arlington", "Austin", "Dallas", "El Paso", "Fort Worth", "Houston", "San Antonio"],
  },
  { code: "UT", name: "Utah", cities: ["Ogden", "Provo", "Salt Lake City", "West Valley City"] },
  { code: "VT", name: "Vermont", cities: ["Burlington", "Montpelier", "Rutland"] },
  {
    code: "VA",
    name: "Virginia",
    cities: ["Alexandria", "Arlington", "Norfolk", "Richmond", "Virginia Beach"],
  },
  { code: "WA", name: "Washington", cities: ["Bellevue", "Seattle", "Spokane", "Tacoma", "Vancouver"] },
  { code: "WV", name: "West Virginia", cities: ["Charleston", "Huntington", "Morgantown"] },
  { code: "WI", name: "Wisconsin", cities: ["Green Bay", "Kenosha", "Madison", "Milwaukee"] },
  { code: "WY", name: "Wyoming", cities: ["Casper", "Cheyenne", "Laramie"] },
];
