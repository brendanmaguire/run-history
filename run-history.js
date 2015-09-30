/**
 * 
 * This application allows the upload of GPX files and plots them on a map
 *
 * There is a control panel which facilitates showing and hiding activities
 * based on date and type. It also adds information popups to the routes.
 *
 */
$( document ).ready(function() {
    var show_tracks_on_init = true;
    var show_track_info = false;
    var auto_fit_to_map = true;
    var visible_activity_types = {}

    // We want to allow multiple open popups at once so hack this function
    L.Map = L.Map.extend({
        openPopup: function (popup, latlng, options) {
            // Commented out to avoid closing open popups
            //this.closePopup();

            if (!(popup instanceof L.Popup)) {
                var content = popup;
                popup = new L.Popup(options)
                    .setLatLng(latlng)
                    .setContent(content);
            }
            popup._isOpen = true;

            this._popup = popup;
            return this.addLayer(popup);
        }
    });

    // Global Data
    var Data = function(){
        var element = $(document);

        return {
            set: function(name, data) {
                element.data(name, data);
            },

            get: function(name, default_val) {
                var data = element.data(name);
                if (data == undefined) {
                    element.data(name, default_val);
                    data = default_val;
                }
                return data
            }
        };
    }();

    // Global Events
    var Events = function(){
        var element = $(document);

        return {
            bind: function(event_name, fn) {
                return element.bind(event_name, fn);
            },

            trigger: function(event_name, data) {
                return element.trigger(event_name, data || []);
            }
        };
    }();

    function setupMap() {
        var map = L.map('map').setView([0, 0], 2);
        L.tileLayer(
                'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png' +
                '?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6IjZjNmRjNzk' +
                '3ZmE2MTcwOTEwMGY0MzU3YjUzOWFmNWZhIn0.Y8bhBaUMqFiPrDRW9hieoQ', {
                    maxZoom: 18,
                    attribution:
                        'Map data &copy; <a href="http://openstreetmap.org">Open' +
                        'StreetMap</a> contributors',
                    id: 'mapbox.streets',
                }).addTo(map);
        return map
    }

    function addLayerControl(map) {
        var layer_ctrl = L.control.layers(null, null, {collapsed: false}).addTo(map);
        // Move the layer control to the controls panel
        $('#controls').append($('.leaflet-control-layers'));

        return layer_ctrl;
    }

    function addFitToMapToggle() {
        var checkbox = createControlCheckbox(
                'Auto Fit Map', 'auto-fit-map',
                auto_fit_to_map, function(event) {
                    auto_fit_to_map = ($(this).is(':checked'));
                    if (auto_fit_to_map) {
                        fitMapBoundsToLayers();
                    }
                });
        $('#map-controls').append(checkbox);
    }

    function addPopupToggle() {
        var checkbox = createControlCheckbox(
                'Show All Tracks Info', 'show-track-info',
                show_track_info, function(event) {
                    show_track_info = ($(this).is(':checked'));
                    toggleTrackInfo(show_track_info);
                });
        $('#map-controls').append(checkbox);
    }

    function addActivityToggleEvent(layerGroups, activity_infos) {
        var checkbox = createControlCheckbox(
                'All Activities', 'all-activities', show_tracks_on_init,
                function(event) {
                    var on = $(this).is(':checked');

                    $('.activity-type input[type=checkbox]').prop('checked', on);

                    for (activity_type in visible_activity_types) {
                        visible_activity_types[activity_type] = on;
                    }

                    if (on) {
                        // Only want to show layers that are within the date range
                        var min_date = $('#slider-range').dateRangeSlider('min');
                        var max_date = $('#slider-range').dateRangeSlider('max');

                        sliderValuesChanged(activity_infos, min_date, max_date);
                    } else {
                        layerGroups.forEach(function(layer) {
                            map.removeLayer(layer);
                        });
                    }

                    Events.trigger('layerChanges');
                });
        $('#activity-controls').prepend(checkbox);
    }

    function addDateSlider(activity_infos) {
        activity_infos.sort(function(a, b) {
            if (a.activity_date < b.activity_date) {
                return -1;
            }

            if (a.activity_date > b.activity_date) {
                return 1;
            }

            return 0;
        });

        var date_bounds = {
            min: activity_infos[0].activity_date,
            max: activity_infos[activity_infos.length - 1].activity_date,
        };

        $("#slider-range").dateRangeSlider(
                {bounds: date_bounds},
                {defaultValues: date_bounds}
                );

        $("#slider-range").bind("valuesChanging", function(e, data){
            var min_date = data.values.min;
            var max_date = data.values.max;
            sliderValuesChanged(activity_infos, min_date, max_date);
        });
    }

    function sliderValuesChanged(activity_infos, min_date, max_date) {
        activity_infos.forEach(function(activity_info) {
            if (activity_info.activity_date < min_date
                    || activity_info.activity_date > max_date) {
                map.removeLayer(activity_info.layer);
            } else {
                if (visible_activity_types[activity_info.type]) {
                    map.addLayer(activity_info.layer);
                }
            }
        });
        Events.trigger('layerChanges');
    }

    function extractActivityInfo(activity_name) {
        var activityRegEx = /^(\D*) ([0-9\/]*)/;
        var match = activityRegEx.exec(activity_name);

        if (match != null) {
            var type = match[1];
            var activity_date = Date.parse(match[2]);
        } else {
            var type = activity_name;
            var activity_date = null;
        }

        return {
            name: activity_name,
            type: type,
            activity_date: activity_date
        }
    }

    function createControlCheckbox(id_name, class_name, checked, click_func) {
        var container_class_names = ['control-checkbox', class_name];
        var checkbox_class_name = class_name + '-input';
        return createCheckbox(
                id_name, container_class_names, checkbox_class_name,
                checked, click_func);
    }

    function createCheckbox(
            id_name, container_class_names, checkbox_class_name,
            checked, click_func) {
        var checkbox_container = $('<div>');

        container_class_names.forEach(function(class_name) {
            checkbox_container.addClass(class_name);
        });

        var checkbox_input = $('<input>', {id: id_name, type: "checkbox"})
            .addClass(checkbox_class_name)
            .prop('checked', checked);

        var checkbox_label = $('<label>', {for: id_name});

        var id_text = $('<span>').append(id_name);

        checkbox_input.click(click_func);

        checkbox_container
            .append(checkbox_input)
            .append(checkbox_label)
            .append(id_text);

        return checkbox_container;
    }

    function addCheckboxForActivity(activity_type) {
        visible_activity_types[activity_type] = show_tracks_on_init;
        var checkbox_container = createControlCheckbox(
                activity_type, 'activity-type', show_tracks_on_init,
                function(e) {
                    var activity_type = $(this).attr('id');
                    var on = $(this).is(':checked');
                    activity_types[activity_type].forEach(function(layer) {
                        if (on) {
                            map.addLayer(layer);
                            visible_activity_types[activity_type] = true;
                        } else {
                            map.removeLayer(layer);
                            visible_activity_types[activity_type] = false;
                        }
                    })
                    Events.trigger('layerChanges');
                });

        $('#activity-types').append(checkbox_container)
    }

    var map = setupMap()

    L.control.scale().addTo(map);
    var layer_ctrl = addLayerControl(map);

    var layerGroups = [];
    var activity_types = {};

    var loadGPX = function (gpx, num_gpx_expected) {
        var activity_gpx = new L.GPX(gpx, {
            async: true,
            max_point_interval: 3600000,
        });

        activity_gpx.on('loaded', function(e) {
            var layer = L.layerGroup([activity_gpx]);
            if (show_tracks_on_init) {
                layer.addTo(map);
            }

            var target = e.target;
            var activity_name = target.get_name();

            target.bindPopup(createPopupContent(target));

            layerGroups.push(layer);
            layer_ctrl.addOverlay(layer, activity_name);

            activity_info = extractActivityInfo(e.target.get_name());
            activity_info.layer = layer;
            activity_info.activity_gpx = activity_gpx;

            var activity_infos = Data.get('activity_infos', []);
            activity_infos.push(activity_info);

            if (activity_info.type in activity_types) {
                activity_types[activity_info.type].push(layer);
            } else {
                activity_types[activity_info.type] = [layer];
                addCheckboxForActivity(activity_info.type);
            }

            Events.trigger('gpxLayerAdded', {num_gpx_expected: num_gpx_expected});
        });
    }

    function createPopupContent(target) {
        var padZeros = function(num) {
            return ("00" + num).slice(-2);
        }

        var milli_to_hours_minutes_seconds = function(duration) {
            return {
                seconds: Math.floor((duration / 1000) % 60),
                minutes: Math.floor((duration / (1000 * 60)) % 60),
                hours: Math.floor((duration / (1000 * 60 * 60)))
            }
        }
        var duration = milli_to_hours_minutes_seconds(target.get_moving_time());
        var duration_str = padZeros(duration.hours) + ':' +
            padZeros(duration.minutes) + ':' + padZeros(duration.seconds);

        var distance_str = (target.get_distance() / 1000).toFixed(1) + 'km';

        var pace = milli_to_hours_minutes_seconds(target.get_moving_pace());
        var pace_str = padZeros(pace.minutes) + ':' + padZeros(pace.seconds) + 'min/km';

        return '<b>' + target.get_name() + '</b><br>Duration: ' + duration_str 
            + '<br>Distance: ' + distance_str + '<br>Pace: ' + pace_str;
    }

    function getAllLayersBounds() {
        var all_layer_bounds = L.latLngBounds(1);
        layerGroups.forEach(function(layerGroup) {
            var layer = layerGroup.getLayers()[0];
            // Only extend with bounds of active layers
            if (map.hasLayer(layer)) {
                all_layer_bounds.extend(layer.getBounds());
            }
        });
        return all_layer_bounds;
    }

    function fitMapBoundsToLayers() {
        map.fitBounds(getAllLayersBounds(), {animate: true});
    }

    function toggleTrackInfo(show) {
        activity_infos.forEach(function(activity_info) {
            if (show) {
                var activity_gpx = activity_info.activity_gpx;
                if (map.hasLayer(activity_gpx)) {
                    activity_gpx.openPopup();
                }
            } else {
                // There is no closePopup function for the layer for some reason
                // so we have to close the popups in this hacky way
                $('.leaflet-popup-close-button').each(function() {
                    $(this)[0].click();  
                });
            }
        });
    }

    var activity_infos = Data.get('activity_infos', []);
    addActivityToggleEvent(layerGroups, activity_infos);

    addFitToMapToggle();
    addPopupToggle();

    Events.bind('layerChanges', function(e) {
        if (auto_fit_to_map) {
            fitMapBoundsToLayers();
        }
        toggleTrackInfo(show_track_info);
    });

    $('#gpx-upload').change(function(e) {
        var file_list = e.target.files;
        var num_files = file_list.length;

        for (var i=0; i < num_files; i++) {
            var file_reader = new FileReader();
            file_reader.onload = function(e) {
                loadGPX(e.target.result, file_list.length);
            };

            var file = file_list.item(i);
            var text = file_reader.readAsText(file);
        }
    });

    Events.bind('gpxLayerAdded', function(e, data) {
        var num_gpx_loaded = Data.get('num_gpx_loaded', 0);
        if (data.num_gpx_expected == ++num_gpx_loaded) {
            Events.trigger('layerChanges');
            addDateSlider(activity_infos);
            Data.set('num_gpx_loaded', 0);
        } else {
            $(this).data('num_gpx_loaded', num_gpx_loaded);
        }
    });

    $('#app-example a').click(function() {
        var example_gpx_files = [
            "gpx/2015-06-15-1047.gpx",
            "gpx/2015-06-18-1432.gpx",
            "gpx/2015-05-20-1202.gpx",
            "gpx/2015-07-17-0837.gpx",
            "gpx/2015-07-01-0947.gpx",
            "gpx/2015-08-04-0855.gpx",
            "gpx/2015-06-02-1143.gpx",
            "gpx/2015-07-21-1803.gpx",
            "gpx/2015-06-25-1437.gpx",
            "gpx/2015-05-13-1246.gpx",
            "gpx/2015-06-18-1142.gpx",
            "gpx/2015-07-06-0608.gpx",
            "gpx/2015-06-15-0911.gpx",
            "gpx/2015-07-26-1823.gpx",
            "gpx/2015-05-04-1328.gpx",
            "gpx/2015-06-05-1119.gpx",
            "gpx/2015-05-18-1113.gpx",
            "gpx/2015-04-23-1428.gpx",
            "gpx/2015-06-19-0635.gpx",
            "gpx/2015-06-17-1148.gpx",
            "gpx/2015-05-05-0816.gpx",
            "gpx/2015-04-06-1436.gpx",
            "gpx/2015-07-05-1021.gpx",
            "gpx/2015-05-21-0936.gpx",
            "gpx/2015-05-02-1225.gpx",
            "gpx/2015-05-14-1343.gpx",
            "gpx/2015-07-09-1719.gpx",
            "gpx/2015-04-27-1220.gpx",
            "gpx/2015-07-29-1408.gpx",
            "gpx/2015-06-17-1147.gpx",
            "gpx/2015-07-15-1717.gpx",
            "gpx/2015-04-21-1244.gpx",
            "gpx/2015-08-01-1902.gpx",
        ]; 
        example_gpx_files.forEach(function(gpx_file) {
            loadGPX(gpx_file, example_gpx_files.length);
        });
    });
});
