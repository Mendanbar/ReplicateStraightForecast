#include <pebble.h>
#include "main.h"
#include "network.h"
#include "bluetooth.h"
#include "persist.h"
#include "weather_layer.h"
#include "debug_layer.h"
#include "battery_layer.h"
#include "datetime_layer.h"
#include "config.h"

#define TIME_FRAME      (GRect(1, 8, 144, 66-8))
#define DATE_FRAME      (GRect(0, 66, 144, 98-66))
#define WEATHER_FRAME   (GRect(0, 98, 144, 70))
#define DEBUG_FRAME     (GRect(0, 82, 144, 15))
#define BATTERY_FRAME   (GRect(72-16, 0, 32, 8))

/* Keep a pointer to the current weather data as a global variable */
static WeatherData *weather_data;

/* Global variables to keep track of the UI elements */
Window *window;

/* Need to wait for JS to be ready */
const  int  MAX_JS_READY_WAIT = 5000; // 5s
static bool initial_request = true;
static AppTimer *initial_jsready_timer;

void face_color_update(WeatherData *weather_data, Window *win) {

	APP_LOG(APP_LOG_LEVEL_DEBUG, "Color [main.c] : %s", weather_data->color);

	if (strcmp(weather_data->color, COLOR_DUKEBLUE) == 0) {
		window_set_background_color(win, GColorDukeBlue);
	} else if (strcmp(weather_data->color, COLOR_BLACK) == 0) {
		window_set_background_color(win, GColorBlack);
	} else if (strcmp(weather_data->color, COLOR_RED) == 0) {
		window_set_background_color(win, GColorRed);
	} else {
		window_set_background_color(win, GColorDarkGray);
	}
}

static void handle_tick(struct tm *tick_time, TimeUnits units_changed) {

	if (units_changed & MINUTE_UNIT) {
		time_layer_update();
		TimeSignal();	// for Hourly vibration

		if (!initial_request) {
			debug_update_weather(weather_data);
			weather_layer_update(weather_data);
			face_color_update(weather_data, window);
		}
	}
	
	if (units_changed & DAY_UNIT) {
		date_layer_update(tick_time);
	}

  /*
   * Useful for showing all icons using Yahoo, subscribe to SECOND_UNIT tick service
   *
  weather_data->temperature = (tick_time->tm_sec + rand()%60) * (rand()%3 ? 1 : -1);
  weather_data->condition = tick_time->tm_sec;
  weather_data->updated = time(NULL);
  weather_data->hourly_enabled = true;
  weather_data->hourly_updated = time(NULL);
  weather_data->h1_cond = tick_time->tm_sec % 30;
  weather_data->h2_cond = tick_time->tm_sec % 30;
  weather_data->h1_time = time(NULL) + (tick_time->tm_sec * (rand()%3600));
  weather_data->h2_time = time(NULL) + (tick_time->tm_sec * (rand()%3600));
  weather_data->h1_temp = (tick_time->tm_sec + rand()%60) * (rand()%3 ? 1 : -1);
  weather_data->h2_temp = (tick_time->tm_sec + rand()%60) * (rand()%3 ? 1 : -1);
  weather_layer_update(weather_data);
  */

	// Refresh the weather info every 30 mins, targeting 18 mins after the hour (Yahoo updates around then)
	if ((units_changed & MINUTE_UNIT) && (tick_time->tm_min % 5 == 0) && !initial_request) {
	//                                   (tick_time->tm_min % 30 == 18) &&
					                    // Change weather refreshing interval as every 5 minute from 30 minutes.
		request_weather(weather_data);
	}
} 

/**
 * Wait for an official 'ready' from javascript or MAX_JS_READY_WAIT, whichever happens sooner 
 */
void initial_jsready_callback()
{
  initial_request = false;

  if (initial_jsready_timer) {
    app_timer_cancel(initial_jsready_timer);
  }

  request_weather(weather_data); 
}

static void init(void) 
{
	APP_LOG(APP_LOG_LEVEL_DEBUG, "init started");

	window = window_create();
	window_stack_push(window, true /* Animated */);
	weather_data = malloc(sizeof(WeatherData));
	init_network(weather_data);
//	window_set_background_color(window, GColorBlack);
	face_color_update(weather_data, window);

	// Setup our layers
	time_layer_create(TIME_FRAME, window);
	date_layer_create(DATE_FRAME, window);
	weather_layer_create(WEATHER_FRAME, window);
	debug_layer_create(DEBUG_FRAME, window);
	battery_layer_create(BATTERY_FRAME, window);

	load_persisted_values(weather_data);

	// Setup Bluetooth connection vibration
	UpdateConnection(bluetooth_connection_service_peek());        //////////// Add to Vibrate on Bluetooth connection / disconnection 
	bluetooth_connection_service_subscribe(UpdateConnection);     //////////// Add to Vibrate on Bluetooth connection / disconnection 

	// Kickoff our weather loading 'dot' animation
	weather_animate(weather_data);

	// Setup a timer incase we miss or don't receive js_ready to manually try ourselves
	initial_jsready_timer = app_timer_register(MAX_JS_READY_WAIT, initial_jsready_callback, NULL);

	// Update the screen right away

	time_t now = time(NULL);

	handle_tick(localtime(&now), MINUTE_UNIT | HOUR_UNIT | DAY_UNIT );

	// And then every minute
	tick_timer_service_subscribe(MINUTE_UNIT, handle_tick);
}

static void deinit(void) 
{
	APP_LOG(APP_LOG_LEVEL_DEBUG, "deinit started");

	tick_timer_service_unsubscribe();

	window_destroy(window);

	time_layer_destroy();
	date_layer_destroy();
	weather_layer_destroy();
	debug_layer_destroy();
	battery_layer_destroy();

	bluetooth_connection_service_unsubscribe();               //////////// Add to Vibrate on Bluetooth connection / disconnection 

	free(weather_data);

	close_network();
}

int main(void) {
	init();
	app_event_loop();
	deinit();
}
