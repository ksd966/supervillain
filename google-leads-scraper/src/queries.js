/**
 * Turns "niche + city" into whatever each source needs to search.
 */

/**
 * Serbian and English niche names mapped to the OpenStreetMap tags that hold
 * them. OSM has no free-text search, so a lookup like this is the price of
 * using it — but it is also what makes that source reliable, since the tags
 * are stable in a way scraped markup is not.
 *
 * Values are `key=value` pairs; a niche can map to several.
 */
export const OSM_NICHE_TAGS = {
    // --- US service businesses, the usual outreach targets ---
    hairdresser: ['shop=hairdresser'],
    'hair salon': ['shop=hairdresser'],
    barber: ['shop=hairdresser'],
    barbershop: ['shop=hairdresser'],
    'nail salon': ['shop=beauty'],
    'med spa': ['shop=beauty', 'leisure=spa'],
    medspa: ['shop=beauty', 'leisure=spa'],
    'beauty salon': ['shop=beauty'],
    'tattoo shop': ['shop=tattoo'],
    'tattoo parlor': ['shop=tattoo'],

    dentist: ['amenity=dentist'],
    'dental office': ['amenity=dentist'],
    orthodontist: ['amenity=dentist'],
    chiropractor: ['amenity=doctors', 'healthcare=chiropractor'],
    'physical therapy': ['healthcare=physiotherapist'],
    optometrist: ['shop=optician'],
    veterinarian: ['amenity=veterinary'],
    vet: ['amenity=veterinary'],

    plumber: ['craft=plumber'],
    plumbing: ['craft=plumber'],
    electrician: ['craft=electrician'],
    hvac: ['craft=hvac'],
    roofing: ['craft=roofer'],
    roofer: ['craft=roofer'],
    contractor: ['craft=builder'],
    landscaping: ['craft=gardener'],
    'auto repair': ['shop=car_repair'],
    'car wash': ['amenity=car_wash'],

    'law firm': ['office=lawyer'],
    attorney: ['office=lawyer'],
    accountant: ['office=accountant'],
    cpa: ['office=accountant'],
    'real estate': ['office=estate_agent'],
    realtor: ['office=estate_agent'],
    'insurance agency': ['office=insurance'],
    'marketing agency': ['office=advertising_agency'],

    gym: ['leisure=fitness_centre'],
    'fitness studio': ['leisure=fitness_centre'],
    'yoga studio': ['leisure=fitness_centre'],
    'crossfit gym': ['leisure=fitness_centre'],

    restaurant: ['amenity=restaurant'],
    'coffee shop': ['amenity=cafe'],
    bakery: ['shop=bakery'],
    brewery: ['craft=brewery'],
    'food truck': ['amenity=fast_food'],
    caterer: ['craft=caterer'],

    photographer: ['craft=photographer'],
    florist: ['shop=florist'],
    'pet grooming': ['shop=pet_grooming'],
    'dry cleaner': ['shop=laundry'],
    'moving company': ['office=moving_company'],
    daycare: ['amenity=childcare'],

    // --- Serbian names kept as aliases ---
    frizer: ['shop=hairdresser'],
    'frizerski salon': ['shop=hairdresser'],

    'kozmeticki salon': ['shop=beauty'],
    'kozmetički salon': ['shop=beauty'],
    kozmetika: ['shop=beauty'],
    beauty: ['shop=beauty'],
    spa: ['leisure=spa', 'shop=beauty'],
    tattoo: ['shop=tattoo'],
    tetovaza: ['shop=tattoo'],
    tetovaža: ['shop=tattoo'],

    restoran: ['amenity=restaurant'],
    restaurant: ['amenity=restaurant'],
    kafic: ['amenity=cafe'],
    kafić: ['amenity=cafe'],
    cafe: ['amenity=cafe'],
    kafana: ['amenity=restaurant', 'amenity=pub'],
    bar: ['amenity=bar', 'amenity=pub'],
    pekara: ['shop=bakery'],
    bakery: ['shop=bakery'],
    poslasticarnica: ['shop=confectionery'],
    poslastičarnica: ['shop=confectionery'],

    teretana: ['leisure=fitness_centre'],
    gym: ['leisure=fitness_centre'],
    fitness: ['leisure=fitness_centre'],
    joga: ['leisure=fitness_centre'],

    zubar: ['amenity=dentist'],
    stomatolog: ['amenity=dentist'],
    dentist: ['amenity=dentist'],
    doktor: ['amenity=doctors'],
    ordinacija: ['amenity=doctors'],
    apoteka: ['amenity=pharmacy'],
    pharmacy: ['amenity=pharmacy'],
    veterinar: ['amenity=veterinary'],

    advokat: ['office=lawyer'],
    lawyer: ['office=lawyer'],
    knjigovodja: ['office=accountant'],
    knjigovođa: ['office=accountant'],
    accountant: ['office=accountant'],
    agencija: ['office=company'],
    'nekretnine': ['office=estate_agent'],
    'real estate': ['office=estate_agent'],

    'auto servis': ['shop=car_repair'],
    autoservis: ['shop=car_repair'],
    'car repair': ['shop=car_repair'],
    autoperionica: ['amenity=car_wash'],

    hotel: ['tourism=hotel'],
    hostel: ['tourism=hostel'],
    apartman: ['tourism=apartment'],

    cvecara: ['shop=florist'],
    cvećara: ['shop=florist'],
    florist: ['shop=florist'],
    fotograf: ['craft=photographer', 'shop=photo'],
    photographer: ['craft=photographer'],
    stolar: ['craft=carpenter'],
    vodoinstalater: ['craft=plumber'],
    elektricar: ['craft=electrician'],
    električar: ['craft=electrician'],
};

/**
 * @param {string} value
 * @returns {string}
 */
function normalize(value) {
    return String(value ?? '').trim().toLowerCase();
}

/**
 * Resolves a niche to OSM tag filters.
 *
 * Accepts a raw `key=value` straight through, so anything missing from the
 * table above is still reachable without a code change.
 *
 * @param {string} niche
 * @returns {string[]} `key=value` pairs, empty when unknown
 */
export function osmTagsForNiche(niche) {
    const key = normalize(niche);
    if (!key) return [];

    if (/^[a-z_:]+=[a-z0-9_:]+$/i.test(key)) return [key];
    if (OSM_NICHE_TAGS[key]) return OSM_NICHE_TAGS[key];

    // "frizerski saloni" -> "frizerski salon", "restorani" -> "restoran"
    const singular = key.replace(/(i|e|a)$/u, '');
    return OSM_NICHE_TAGS[singular] ?? OSM_NICHE_TAGS[`${singular}a`] ?? [];
}

/**
 * Builds the search phrases fed to Google Maps.
 *
 * @param {object} params
 * @param {string} [params.niche]
 * @param {string|string[]} [params.city]
 * @param {string[]} [params.queries] explicit phrases, used verbatim
 * @returns {string[]}
 */
export function buildQueries({ niche, city, queries = [] } = {}) {
    const explicit = queries.map((q) => String(q).trim()).filter(Boolean);
    if (explicit.length) return [...new Set(explicit)];

    const trimmedNiche = String(niche ?? '').trim();
    if (!trimmedNiche) return [];

    const cities = (Array.isArray(city) ? city : [city])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);

    if (!cities.length) return [trimmedNiche];

    return [...new Set(cities.map((one) => `${trimmedNiche} ${one}`))];
}

/**
 * The Overpass QL for "every place matching these tags inside this city".
 *
 * `area[name=...]` resolves the city by its administrative boundary, so the
 * name has to match what OSM calls it — "Beograd", not "Belgrade".
 *
 * @param {object} params
 * @param {string} params.city
 * @param {string[]} params.tags `key=value` pairs
 * @param {number} [params.timeoutSecs]
 * @returns {string}
 */
export function buildOverpassQuery({ city, tags, timeoutSecs = 90 }) {
    if (!city) throw new Error('Overpass needs a city name.');
    if (!tags?.length) throw new Error('Overpass needs at least one tag filter.');

    const escapedCity = String(city).replace(/["\\]/g, '\\$&');
    const filters = tags
        .map((tag) => {
            const [key, value] = tag.split('=');
            return `  nwr["${key}"="${value}"](area.searchArea);`;
        })
        .join('\n');

    return [
        `[out:json][timeout:${timeoutSecs}];`,
        `area["name"="${escapedCity}"]["boundary"="administrative"]->.searchArea;`,
        '(',
        filters,
        ');',
        'out center tags;',
    ].join('\n');
}
