extends Node2D

# Kamera
var cam_speed = 400
var zoom_min = 0.5
var zoom_max = 3.0

# Oyun durumu
var gold = 200
var selected_units = []

func _ready():
print("Iron Front başladı!")

func _process(delta):
_handle_camera(delta)

func _handle_camera(delta):
var cam = $Camera2D
if Input.is_action_pressed("ui_left"):
cam.position.x -= cam_speed * delta
if Input.is_action_pressed("ui_right"):
cam.position.x += cam_speed * delta
if Input.is_action_pressed("ui_up"):
cam.position.y -= cam_speed * delta
if Input.is_action_pressed("ui_down"):
cam.position.y += cam_speed * delta
