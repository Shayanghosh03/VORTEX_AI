(function () {
  if (typeof window === 'undefined') return;

  window.addEventListener('DOMContentLoaded', function () {
    var form = document.querySelector('.model-form');
    if (!form) return;

    var latInput = document.getElementById('latitude');
    var lonInput = document.getElementById('longitude');
    var statusEl = document.getElementById('location-status');

    if (!latInput || !lonInput || !navigator.geolocation) {
      if (statusEl) {
        statusEl.textContent = 'Browser location not available — continue with manual scenario inputs.';
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = 'Detecting your live location…';
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;

        latInput.value = lat;
        lonInput.value = lng;

        if (statusEl) {
          statusEl.textContent = 'Using live GPS: ' + lat.toFixed(4) + ', ' + lng.toFixed(4);
        }

        // Also log to console for debugging, as requested
        console.log('Damage model live location:', lat, lng);
      },
      function (err) {
        if (statusEl) {
          if (err && err.code === 1) {
            statusEl.textContent = 'Location access blocked — enable location to geo-tag this run.';
          } else {
            statusEl.textContent = 'Unable to read live location — continue with manual scenario inputs.';
          }
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );

    // If a result map container is present, initialize a small Leaflet map
    var mapContainer = document.getElementById('damage-map-view');
    if (mapContainer && typeof L !== 'undefined') {
      var lat = parseFloat(mapContainer.getAttribute('data-lat'));
      var lon = parseFloat(mapContainer.getAttribute('data-lon'));
      var label = (mapContainer.getAttribute('data-label') || '').toUpperCase();

      if (isFinite(lat) && isFinite(lon)) {
        var map = L.map(mapContainer, {
          zoomControl: false,
          attributionControl: false,
        }).setView([lat, lon], 8);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        var color = '#22c55e';
        if (label === 'CRITICAL') {
          color = '#ef4444';
        } else if (label === 'HIGH') {
          color = '#f97316';
        } else if (label === 'MODERATE') {
          color = '#eab308';
        }

        L.circle([lat, lon], {
          color: color,
          fillColor: color,
          fillOpacity: 0.25,
          radius: 30000,
        }).addTo(map);

        L.circleMarker([lat, lon], {
          radius: 6,
          color: color,
          fillColor: color,
          fillOpacity: 0.9,
        }).addTo(map).bindPopup('Scenario location');

        setTimeout(function () {
          map.invalidateSize();
        }, 300);
      }
    }
  });
})();
