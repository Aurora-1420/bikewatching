import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken = 'pk.eyJ1IjoiYXljb25nIiwiYSI6ImNtd2RyaThxcjAwYmsyeG85dzZ3eDZhMHkifQ.cs7d4exjms9VcVM4yZEX8A';



const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

let timeFilter = -1;
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

if (!timeSlider || !selectedTime || !anyTimeLabel) {
  throw new Error('Time filter controls are missing from the page.');
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value);

  if (timeFilter === -1) {
    selectedTime.textContent = '';
    anyTimeLabel.style.display = 'block';
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = 'none';
  }
}

timeSlider.addEventListener('input', updateTimeDisplay);
updateTimeDisplay();

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

map.on('load', async () => {
  const bikeLaneStyle = {
    'line-color': '#32D400',
    'line-width': 3,
    'line-opacity': 0.6,
  };

  map.addSource('boston-bike-lanes', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'boston-bike-lanes',
    type: 'line',
    source: 'boston-bike-lanes',
    paint: bikeLaneStyle,
  });

  map.addSource('cambridge-bike-lanes', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  });

  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge-bike-lanes',
    paint: bikeLaneStyle,
  });

  const svg = d3.select('#map').select('svg');

  try {
    const [jsonData, trips] = await Promise.all([
      d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json'),
      d3.csv(
        'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv'
      ),
    ]);
    const rawStations = jsonData?.data?.stations;

    if (!Array.isArray(rawStations)) {
      throw new Error('Station data is missing the expected data.stations array.');
    }

    const validStations = rawStations.filter(
      (station) =>
        Number.isFinite(Number(station.lon)) &&
        Number.isFinite(Number(station.lat))
    );

    if (validStations.length !== rawStations.length) {
      console.warn(
        `Skipped ${rawStations.length - validStations.length} stations with invalid coordinates.`
      );
    }

    const departures = d3.rollup(
      trips,
      (records) => records.length,
      (trip) => trip.start_station_id
    );
    const arrivals = d3.rollup(
      trips,
      (records) => records.length,
      (trip) => trip.end_station_id
    );
    const stations = validStations.map((station) => {
      const id = station.short_name;
      const stationArrivals = arrivals.get(id) ?? 0;
      const stationDepartures = departures.get(id) ?? 0;

      return {
        ...station,
        arrivals: stationArrivals,
        departures: stationDepartures,
        totalTraffic: stationArrivals + stationDepartures,
      };
    });
    const maxTraffic = d3.max(stations, (station) => station.totalTraffic) ?? 0;
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, maxTraffic || 1])
      .range([0, 25]);

    const circles = svg
      .selectAll('circle')
      .data(stations)
      .join('circle')
      .attr('r', (station) => radiusScale(station.totalTraffic))
      .attr('fill', 'steelblue')
      .each(function (station) {
        d3.select(this)
          .append('title')
          .text(
            `${station.totalTraffic} trips (${station.departures} departures, ${station.arrivals} arrivals)`
          );
      });

    function updatePositions() {
      circles
        .attr('cx', (station) => getCoords(station).cx)
        .attr('cy', (station) => getCoords(station).cy);
    }

    updatePositions();
    map.on('move', updatePositions);
    map.on('resize', updatePositions);
  } catch (error) {
    console.error('Error loading Bluebikes station data:', error);
  }
});

function getCoords(station) {
  const point = new mapboxgl.LngLat(Number(station.lon), Number(station.lat));
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}
