export function mapUrlClient(f: { lat: number | null; lng: number | null }) {
  return f.lat && f.lng ? `https://yandex.uz/maps/?pt=${f.lng},${f.lat}&z=17&l=map` : null;
}
