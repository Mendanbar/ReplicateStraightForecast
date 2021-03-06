var SERVICE_OPEN_WEATHER    = "open";
var SERVICE_YAHOO_WEATHER   = "yahoo";
var SERVICE_WUNDER_WEATHER  = "wundr";		///// Add WeatherUnderground for Current Weather Conditions
var COLOR_DUKEBLUE			= "duke";
var COLOR_BLACK				= "black";
var COLOR_RED				= "red";		///// Add Background Color value
var EXTERNAL_DEBUG_URL    = '';
var CONFIGURATION_URL     = 'https://dl.dropboxusercontent.com/u/47440161/site/pebbleConfig/phone20151218.html';		//////// Config URL for PHONE //////
// var CONFIGURATION_URL     = 'https://dl.dropboxusercontent.com/u/47440161/site/pebbleConfig/emulator20151218.html';	//////// Config URL for EMULATOR //////

var Global = {
	externalDebug:     false, // POST logs to external server - dangerous! lat lon recorded
	wuApiKey:          'b26c799075daaec9', // register for a free api key!
	tsStartTime:       7,
	tsEndTime:         22,
	hourlyIndex1:      2, // 3 Hours from now 
	hourlyIndex2:      5, // 6 hours from now                                  //////// Change to 5 from 8 ////////
	updateInProgress:  false,
	updateWaitTimeout: 1 * 60 * 1000, // one minute in ms
	lastUpdateAttempt: new Date(),
	maxRetry:          3,
	retryWait:         500, // ms
	config: {
		debugEnabled:   false,
		bluetoothAlert: true,
		batteryEnabled: true,
		timesigEnabled: false,
		stopHourly:		false,
		backColor:		COLOR_RED,
		weatherService: SERVICE_WUNDER_WEATHER,
		weatherScale:   'F'
	},
};

// Allow console messages to be turned on / off 
(function(){
    var original = console.log;
    var logMessage = function (message) {
        if (Global.config.debugEnabled) {
          original.apply(console, arguments);
        }  
    };
    console.log  = logMessage;
    console.warn = logMessage;
})();


// Setup Pebble Event Listeners
Pebble.addEventListener("ready", function(e) {
    console.log("Starting ...");
    var data = { "js_ready": true };
    Pebble.sendAppMessage(data, ack, function(e){
      nack(data);
    });
	var initialInstall = window.localStorage.getItem('initialInstall');
    if (initialInstall === null && Global.wuApiKey === null) {
		window.localStorage.setItem('initialInstall', false);
		Pebble.showSimpleNotificationOnPebble("API Key Needed", "This watchface requires a free API key from Weather Underground. Please visit Settings in the Pebble App to find out more!");
	}
});

Pebble.addEventListener("appmessage", function(data) {
    console.log("Got a message - Starting weather request ... " + JSON.stringify(data));
    try {																				///// Add WeatherUnderground for Current Weather Conditions
		Global.config.weatherService =    (data.payload.service === SERVICE_OPEN_WEATHER) ?  SERVICE_OPEN_WEATHER
										: (data.payload.service === SERVICE_YAHOO_WEATHER) ? SERVICE_YAHOO_WEATHER
										: SERVICE_WUNDER_WEATHER;
		Global.config.backColor =		  (data.payload.color === COLOR_DUKEBLUE) ?  COLOR_DUKEBLUE
										: (data.payload.color === COLOR_BLACK) ? COLOR_BLACK
										: COLOR_RED;
		Global.config.debugEnabled   =  data.payload.debug   === 1;
		Global.config.bluetoothAlert =  data.payload.bluetooth === 1;
		Global.config.timesigEnabled =  data.payload.timesig === 1;
		Global.config.stopHourly	 =  data.payload.stophourly === 1;
		Global.config.batteryEnabled =  data.payload.battery === 1;
		Global.config.weatherScale   = (data.payload.scale   === 'C') ? 'C' : 'F';
		Global.wuApiKey              =  window.localStorage.getItem('wuApiKey');
//		Global.tsStartTime           =  window.localStorage.getItem('tsStartTime');
//		Global.tsEndTime             =  window.localStorage.getItem('tsEndTime');
		updateWeather();
	} catch (ex) {
      console.warn("Could not retrieve data sent from Pebble: "+ex.message);
    }
});

/**
 * This is the reason for the Global.config variable - I couldn't think of a way (short of asking Pebble)
 * for the latest config settings. So I persist them in a rather ugly Global variable. 
 */
Pebble.addEventListener("showConfiguration", function (e) {
	var options = {
		's': Global.config.weatherService,
		'c': Global.config.backColor,
		'd': Global.config.debugEnabled,
		'u': Global.config.weatherScale,
		'b': Global.config.batteryEnabled ? 'on' : 'off',
		't': Global.config.bluetoothAlert ? 'on' : 'off',
		'v': Global.config.timesigEnabled ? 'on' : 'off',
		'o': Global.config.stopHourly	  ? 'on' : 'off',
		'a': Global.wuApiKey
//		'f': Global.tsStartTime,
//		'e': Global.tsEndTime
	};
	var url = CONFIGURATION_URL+'?'+serialize(options);
	console.log('Configuration requested using url: '+url);
	Pebble.openURL(url);
});

Pebble.addEventListener("webviewclosed", function(e) {
	/*
	 * Android Hack - for whatever reason this event is always firing on Android with a message of 'CANCELLED'
	 */
	if (e.response && e.response !== 'CANCELLED') {
		try {
			var settings = JSON.parse(decodeURIComponent(e.response));

			// Android 'cancel' sends a blank object
			if (Object.keys(settings).length <= 0) {
				return; 
			}

			console.log("Settings received: "+JSON.stringify(settings));

			var refreshNeeded = (	settings.service		!== Global.config.weatherService	||
									settings.color			!== Global.config.backColor			||
									settings.scale			!== Global.config.weatherScale		||
									settings.wuApiKey		!== Global.wuApiKey
								);
																		///// Add WeatherUnderground for Current Weather Conditions
			Global.config.weatherService = (settings.service === SERVICE_OPEN_WEATHER)  ? SERVICE_OPEN_WEATHER
										 : (settings.service === SERVICE_YAHOO_WEATHER) ? SERVICE_YAHOO_WEATHER
										 : SERVICE_WUNDER_WEATHER;
			Global.config.backColor =	   (settings.color === COLOR_DUKEBLUE)  ? COLOR_DUKEBLUE
										 : (settings.color === COLOR_BLACK) ? COLOR_BLACK
										 : COLOR_RED;
			Global.config.weatherScale   = settings.scale   === 'C' ? 'C' : 'F';
			Global.config.debugEnabled   = settings.debug   === 'true';
			Global.config.bluetoothAlert = settings.bluetooth === 'on';
			Global.config.timesigEnabled = settings.timesig === 'on';
			Global.config.stopHourly	 = settings.stophourly === 'on';
			Global.config.batteryEnabled = settings.battery === 'on';
			Global.wuApiKey              = settings.wuApiKey;
//			Global.tsStartTime           = settings.StartSig;
//			Global.tsEndTime             = settings.Endsig;

			if (Global.wuApiKey !== null) {
				window.localStorage.setItem('wuApiKey', Global.wuApiKey);
			} else {
				window.localStorage.removeItem('wuApiKey');
			}
        
			var config = {
				service:	Global.config.weatherService,
				color:		Global.config.backColor,
				scale:		Global.config.weatherScale,
				debug:		Global.config.debugEnabled   ? 1 : 0,
				bluetooth:	Global.config.bluetoothAlert ? 1 : 0,
				battery:	Global.config.batteryEnabled ? 1 : 0,
				timesig:	Global.config.timesigEnabled ? 1 : 0,
				stophourly: Global.config.stopHourly 	 ? 1 : 0
			};

			Pebble.sendAppMessage(config, ack, function(ev){
				nack(config);
			});

			if (refreshNeeded) {
				updateWeather();
			}
		} catch(ex) {
			console.warn("Unable to parse response from configuration:"+ex.message);
		}
	}
});

var ack  = function ()  { console.log("Pebble ACK sendAppMessage");}
var nack = function (data, retry) {
  retry = typeof retry !== 'undefined' ? retry : 0;
  retry++;
  if (retry >= Global.maxRetry) {
    console.warn("Pebble NACK sendAppMessage max exceeded");
    return;
  } 
  console.warn("Pebble NACK sendAppMessage retryCount:"+retry+" data:"+JSON.stringify(data));
  if (data) {
    setTimeout(function(){
          Pebble.sendAppMessage(data, ack, function(e){
            nack(data, retry);
          });
    }, Global.retryWait + Math.floor(Math.random() * Global.retryWait));
  }
}

var updateWeather = function () {
  if (Global.updateInProgress && 
      new Date().getTime() < Global.lastUpdateAttempt.getTime() + Global.updateWaitTimeout) {
    console.log("Update already started in the last "+(Global.updateWaitTimeout/60000)+" minutes");
    return;
  }
  Global.updateInProgress  = true;
  Global.lastUpdateAttempt = new Date();

  var locationOptions = { "timeout": 15000, "maximumAge": 60000 };
  navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);
}

var locationSuccess = function (pos) {
	var coordinates = pos.coords;
	console.log("Got coordinates: " + JSON.stringify(coordinates));

	if (Global.config.weatherService === SERVICE_OPEN_WEATHER) {
		fetchOpenWeather(coordinates.latitude, coordinates.longitude);
	} else if (Global.config.weatherService === SERVICE_YAHOO_WEATHER) {
		fetchYahooWeather(coordinates.latitude, coordinates.longitude);
    } else {
		fetchWunderWeather(coordinates.latitude, coordinates.longitude);		///// Add WeatherUnderground for Current Weather Conditions
	}

	if (Global.wuApiKey !== null) {
		fetchWunderWeatherForcast(coordinates.latitude, coordinates.longitude);
	} else {
      var data = {hourly_enabled: 0};
      console.log("Hourly disabled, no WU ApiKey");
      Pebble.sendAppMessage(data, ack, function(ev){
          nack(data);
      });
    }
}

var locationError = function (err) {
    var message = 'Location error (' + err.code + '): ' + err.message;
    console.warn(message);
    Pebble.sendAppMessage({ "error": "Loc unavailable" }, ack, nack);
    postDebugMessage({"error": message});
    Global.updateInProgress = false;
}

var fetchYahooWeather = function(latitude, longitude) {

	var subselect, neighbor, query, multi, optionsA = {};

	subselect   = 'SELECT woeid FROM geo.placefinder WHERE text="'+latitude+','+longitude+'" AND gflags="R"';
	neighbor    = 'SELECT * FROM geo.placefinder WHERE text="'+latitude+','+longitude+'" AND gflags="R";';
	query       = 'SELECT * FROM weather.forecast WHERE woeid IN ('+subselect+') AND u="'+Global.config.weatherScale.toLowerCase()+'";';
	multi       = "SELECT * FROM yql.query.multi WHERE queries='"+query+" "+neighbor+"'";
	optionsA.url = "https://query.yahooapis.com/v1/public/yql?format=json&q="+encodeURIComponent(multi)+"&nocache="+new Date().getTime();

	optionsA.parse = function(response) {
		var sunrise, sunset, pubdate, locale;
		sunrise = response.query.results.results[0].channel.astronomy.sunrise;
		sunset  = response.query.results.results[0].channel.astronomy.sunset;
		pubdate = new Date(Date.parse(response.query.results.results[0].channel.item.pubDate));
		locale  = response.query.results.results[1].Result.neighborhood;
		if (locale === null) {
			locale = response.query.results.results[1].Result.city;
		}
		if (locale === null) {
			locale = 'unknown';
		}

		return {
			condition:   parseInt(response.query.results.results[0].channel.item.condition.code),
			temperature: parseInt(response.query.results.results[0].channel.item.condition.temp),
			sunrise:     Date.parse(new Date().toDateString()+" "+sunrise) / 1000,
			sunset:      Date.parse(new Date().toDateString()+" "+sunset) / 1000,
			locale:      locale,
			pubdate:     pubdate.getHours()+':'+('0'+pubdate.getMinutes()).slice(-2),
			tzoffset:    new Date().getTimezoneOffset() * 60
		};
	};

	fetchWeather(optionsA); 
};

var fetchOpenWeather = function(latitude, longitude) {

  var options = {};
  options.url = "http://api.openweathermap.org/data/2.5/weather?lat=" + latitude + "&lon=" + longitude + "&cnt=1";

  options.parse = function(response) {
      var temperature, sunrise, sunset, condition, pubdate;

      var tempResult = response.main.temp;
      if (Global.config.weatherScale === 'C') {
        // Convert temperature to Celsius
        temperature = Math.round(tempResult - 273.15);
      } 
      else {
        // Otherwise, convert temperature to Fahrenheit 
        temperature = Math.round(((tempResult - 273.15) * 1.8) + 32);
      }

      condition = response.weather[0].id;
      sunrise   = response.sys.sunrise;
      sunset    = response.sys.sunset;
      pubdate   = new Date(response.dt*1000); 

      return {
        condition:   condition,
        temperature: temperature, 
        sunrise:     sunrise,
        sunset:      sunset,
        locale:      response.name,
        pubdate:     pubdate.getHours()+':'+('0'+pubdate.getMinutes()).slice(-2),
        tzoffset:    new Date().getTimezoneOffset() * 60
      };
  };
  fetchWeather(options);
};

var fetchWunderWeather = function(latitude, longitude) {

	var sunrise, sunset, pubdate, options = {};
	var temperature, tz_offset, unixtime, date, year, month, day, hour, min;

	options.url = 'http://api.wunderground.com/api/'+Global.wuApiKey+'/astronomy/conditions/q/'+latitude+','+longitude+'.json';

	options.parse = function(response) {
      if (Global.config.weatherScale === 'C') {
        // Convert temperature to Celsius
        temperature = response.current_observation.temp_c;
      } 
      else {
        // Otherwise, convert temperature to Fahrenheit 
        temperature = response.current_observation.temp_f;
      }

		tz_offset = (parseInt(response.current_observation.local_tz_offset) / 100) * 3600;		// tz_offset is not used.
		unixtime = parseInt(response.current_observation.observation_epoch);					// "unixtime" is not actual Unix Time but Local Time in unix time form
		date = new Date(unixtime * 1000);
		year = date.getFullYear();
		month = ((date.getMonth() + 1) < 10) ? '0' + (date.getMonth() + 1) : (date.getMonth() + 1);
		day =   (date.getDate() < 10) ? '0' + date.getDate() : date.getDate();

		hour = response.sun_phase.sunrise.hour;
		hour = (hour.length === 1) ? '0' + hour : hour;
		min  = response.sun_phase.sunrise.minute;
		min  = (min.length === 1) ? '0' + min : min;
		sunrise = Math.floor( new Date(year + "/" + month + "/" + day + ' ' + hour + ":" + min + ":" + "00").getTime() / 1000 );

		hour = response.sun_phase.sunset.hour;
		hour = (hour.length === 1) ? '0' + hour : hour;
		min  = response.sun_phase.sunset.minute;
		min  = (min.length === 1) ? '0' + min : min;
		sunset = Math.floor( new Date(year + "/" + month + "/" + day + ' ' + hour + ":" + min + ":" + "00").getTime() / 1000 );

		pubdate   = new Date(parseInt(response.current_observation.observation_epoch) * 1000);

		return {
				condition:		Wunder_Comvert(response.current_observation.icon),
				temperature:	temperature,
				sunrise:		sunrise,
				sunset:			sunset,
				locale:			response.current_observation.display_location.city,
				pubdate:		pubdate.getHours()+':'+('0'+pubdate.getMinutes()).slice(-2),
				tzoffset:		new Date().getTimezoneOffset() * 60
		};
	};

	fetchWeather(options);
};

var Wunder_Comvert = function(condition) {
	if (condition == "clear" || condition == "sunny")
		return 1;
	else if (condition == "mostlysunny" || condition == "partlycloudy")
		return 2;
	else if (condition == "mostlycloudy" || condition == "partlysunny")
		return 3;
	else if (condition == "cloudy")
		return 4;
	else if (condition == "hazy")
		return 5;
	else if (condition == "fog")
		return 6;
	else if (condition == "chancerain")
		return 12;
	else if (condition == "rain")
		return 13;
	else if (condition == "chancetstorms")
		return 14;
	else if (condition == "tstorms" || condition == "unknown")
		return 15;
	else if (condition == "flurries" || condition == "sleet")
		return 16;
	else if (condition == "chancesnow")
		return 20;
	else if (condition == "snow")
		return 21;
	else if (condition == "chanceflurries" || condition == "chancesleet")
		return 22;
	else
		return 7;
};

var fetchWunderWeatherForcast = function(latitude, longitude) {

  var options = {};
  options.url = 'http://api.wunderground.com/api/'+Global.wuApiKey+'/hourly/q/'+latitude+','+longitude+'.json';

  options.parse = function(response) {
        
      var h1 = response.hourly_forecast[Global.hourlyIndex1]
        , h2 = response.hourly_forecast[Global.hourlyIndex2];  

      return {
        h1_temp: Global.config.weatherScale === 'C' ? parseInt(h1.temp.metric) : parseInt(h1.temp.english),
        h1_cond: parseInt(h1.fctcode), 
        h1_time: parseInt(h1.FCTTIME.epoch),
        h1_pop:  parseInt(h1.pop),
        h2_temp: Global.config.weatherScale === 'C' ? parseInt(h2.temp.metric) : parseInt(h2.temp.english),
        h2_cond: parseInt(h2.fctcode), 
        h2_time: parseInt(h2.FCTTIME.epoch),
        h2_pop:  parseInt(h2.pop)
      };
  };
  fetchWeather(options);
};

var fetchWeather = function(options) {

  //console.log('URL: ' + options.url);

  getJson(options.url, function(err, response) {

    try {
      if (err) {
        throw err;
      }

      var weather = options.parse(response);

      console.log('Weather Data: ' + JSON.stringify(weather));

      Pebble.sendAppMessage(weather, ack, function(e){
        nack(weather);
      });
      postDebugMessage(weather);
    
    } catch (ex) {
      console.warn("Could not find weather data in response: " + ex.message);
      var error = { "error": "HTTP Error" };
      Pebble.sendAppMessage(error, ack, nack);
      postDebugMessage(error);
    }
    Global.updateInProgress = false;
  });
};

var getJson = function(url, callback) {
  try {
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.onload = function(e) {
      if (req.readyState == 4) {
        if(req.status == 200) {
          try {
            //console.log(req.responseText);
            var response = JSON.parse(req.responseText);
            callback(null, response);
          } catch (ex) {
            callback(ex.message);
          }
        } else {
          callback("Error request status not 200, status: "+req.status);
        }
      }
    };
    req.send(null);
  } catch(ex) {
    callback("Unable to GET JSON: "+ex.message);
  }
};

var postDebugMessage = function (data) {
  if (!Global.externalDebug || EXTERNAL_DEBUG_URL === null) {
    return;
  }
  try {
    post(EXTERNAL_DEBUG_URL, 'data='+JSON.stringify(data));
  } catch (ex) {
    console.warn('Post Debug Message failed:'+ex.message);
  }  
};

var post = function(url, data) {
  try {
    var req = new XMLHttpRequest();
    req.open('POST', url, true);
    req.send(data);
  } catch(ex) {
    console.warn('POST failed: ' + ex.message);
  }
};

var serialize = function(obj) {
  var str = [];
  for(var p in obj)
    if (obj.hasOwnProperty(p)) {
      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
    }
  return str.join("&");
}