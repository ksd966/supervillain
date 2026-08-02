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
    frizer: ['shop=hairdresser'],
    'frizerski salon': ['shop=hairdresser'],
    hairdresser: ['shop=hairdresser'],
    barber: ['shop=hairdresser', 'shop=beauty'],

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
