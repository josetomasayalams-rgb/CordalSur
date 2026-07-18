export const CATEGORIES = {
  restaurant: { label: 'Restaurantes', color: '#d45b3e' },
  coffee: { label: 'Cafés', color: '#8b5e3c' },
  fast_food: { label: 'Comida rápida', color: '#dd7b29' },
  bakery: { label: 'Panaderías', color: '#bd7f3f' },
  supermarket: { label: 'Supermercados', color: '#2f7d5b' },
  convenience: { label: 'Tiendas de conveniencia', color: '#4d8f55' },
  hardware: { label: 'Ferreterías', color: '#6f7680' },
  home_improvement: { label: 'Mejoramiento del hogar', color: '#65717d' },
  pharmacy: { label: 'Farmacias', color: '#258f7a' },
  medical: { label: 'Salud', color: '#cf3f54' },
  veterinary: { label: 'Veterinaria', color: '#8553a6' },
  gas_station: { label: 'Bencina', color: '#4c5968' },
  hotel: { label: 'Hoteles', color: '#5658a6' },
  cabin: { label: 'Cabañas', color: '#78634b' },
  ski: { label: 'Ski', color: '#3677a8' },
  thermal_baths: { label: 'Termas', color: '#2b8da0' },
  trail: { label: 'Senderos', color: '#4d7e45' },
  tourism: { label: 'Turismo', color: '#4f75a1' },
  adventure: { label: 'Aventura', color: '#9a5a32' },
  bank: { label: 'Bancos', color: '#315c83' },
  atm: { label: 'Cajeros', color: '#3c6f91' },
  laundry: { label: 'Lavandería', color: '#547e9b' },
  shopping: { label: 'Compras', color: '#9a5078' },
  vehicle_service: { label: 'Servicios vehiculares', color: '#59636f' },
  emergency: { label: 'Emergencias', color: '#bd2f3d' },
  other: { label: 'Otros', color: '#66706c' }
};

const AMENITY = {
  restaurant: 'restaurant', cafe: 'coffee', fast_food: 'fast_food', food_court: 'fast_food',
  ice_cream: 'coffee', pharmacy: 'pharmacy', clinic: 'medical', hospital: 'medical', doctors: 'medical',
  dentist: 'medical', veterinary: 'veterinary', fuel: 'gas_station', bank: 'bank', atm: 'atm',
  car_wash: 'vehicle_service', car_rental: 'vehicle_service', police: 'emergency',
  fire_station: 'emergency', mountain_rescue: 'emergency'
};
const SHOP = {
  bakery: 'bakery', supermarket: 'supermarket', convenience: 'convenience', hardware: 'hardware',
  doityourself: 'home_improvement', farm: 'convenience', sports: 'shopping', outdoor: 'shopping',
  mall: 'shopping', department_store: 'shopping', variety_store: 'shopping', car_parts: 'vehicle_service',
  tyres: 'vehicle_service', laundry: 'laundry', dry_cleaning: 'laundry'
};
const TOURISM = {
  hotel: 'hotel', motel: 'hotel', hostel: 'hotel', guest_house: 'cabin', chalet: 'cabin',
  apartment: 'cabin', attraction: 'tourism', viewpoint: 'tourism', information: 'tourism',
  picnic_site: 'tourism', wilderness_hut: 'trail'
};

export function canonicalCategory(tags = {}) {
  if (AMENITY[tags.amenity]) return AMENITY[tags.amenity];
  if (SHOP[tags.shop]) return SHOP[tags.shop];
  if (TOURISM[tags.tourism]) return TOURISM[tags.tourism];
  if (tags.natural === 'hot_spring' || tags.leisure === 'water_park') return 'thermal_baths';
  if (tags.leisure === 'ski_resort' || tags.sport === 'skiing' || tags['piste:type']) return 'ski';
  if (tags.natural === 'cave_entrance' || tags.natural === 'peak') return 'tourism';
  if (tags.route === 'hiking' || tags.highway === 'path') return 'trail';
  if (tags.leisure === 'sports_centre' || tags.leisure === 'adventure_park') return 'adventure';
  return 'other';
}

export function categoryEntries() {
  return Object.entries(CATEGORIES).map(([id, value]) => ({ id, ...value }));
}
