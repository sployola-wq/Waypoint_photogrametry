export interface DemoArea {
  id: string;
  name: string;
  category: string;
  locationName: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  polygon: [number, number][]; // [lng, lat] coordinates
  recommendedAltitude: number;
  recommendedSpeed: number;
  recommendedFlightAngle: number;
  description: string;
}

export const DEMO_AREAS: DemoArea[] = [
  {
    id: 'agri-field-chile',
    name: 'Campo Agrícola (Valle Central)',
    category: 'Agricultura de Precisión',
    locationName: 'Curicó, Región del Maule, Chile',
    center: [-71.2405, -34.985],
    zoom: 17,
    polygon: [
      [-71.2425, -34.9835],
      [-71.2382, -34.9842],
      [-71.2388, -34.9872],
      [-71.2432, -34.9862],
    ],
    recommendedAltitude: 75,
    recommendedSpeed: 7,
    recommendedFlightAngle: 82,
    description: 'Polígono cuadrilátero regular con cultivo de frutales para mapeo multiespectral y ortomosaico RGB.',
  },
  {
    id: 'quarry-mine',
    name: 'Cantera de Áridos y Movimiento de Tierra',
    category: 'Minería y Volumetría',
    locationName: 'Til Til, Región Metropolitana, Chile',
    center: [-70.925, -33.085],
    zoom: 16,
    polygon: [
      [-70.9285, -33.0825],
      [-70.9215, -33.0838],
      [-70.9228, -33.0882],
      [-70.9268, -33.0888],
      [-70.9292, -33.0858],
    ],
    recommendedAltitude: 100,
    recommendedSpeed: 8,
    recommendedFlightAngle: 105,
    description: 'Área irregular con desniveles para cálculo volumétrico de acopios y modelo digital de elevaciones (DEM).',
  },
  {
    id: 'solar-plant',
    name: 'Parque Solar Fotovoltaico',
    category: 'Energías Renovables',
    locationName: 'Desierto de Atacama, Chile',
    center: [-69.852, -22.385],
    zoom: 17,
    polygon: [
      [-69.855, -22.382],
      [-69.848, -22.382],
      [-69.848, -22.388],
      [-69.855, -22.388],
    ],
    recommendedAltitude: 50,
    recommendedSpeed: 5,
    recommendedFlightAngle: 0,
    description: 'Alineación de módulos fotovoltaicos N-S para inspección termográfica y fotogramétrica de alta resolución.',
  },
  {
    id: 'urban-construction',
    name: 'Obra Civil y Loteo Residencial',
    category: 'Construcción e Infraestructura',
    locationName: 'Colina / Chicureo, Santiago, Chile',
    center: [-70.672, -33.285],
    zoom: 17,
    polygon: [
      [-70.6748, -33.2832],
      [-70.6692, -33.2845],
      [-70.6705, -33.2882],
      [-70.6755, -33.2868],
    ],
    recommendedAltitude: 60,
    recommendedSpeed: 6,
    recommendedFlightAngle: 165,
    description: 'Polígono de desarrollo inmobiliario para seguimiento de avance de obra y catastro topográfico.',
  },
];
