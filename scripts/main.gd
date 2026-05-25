extends Node2D

var cam_speed: float = 400.0
var gold: int = 200
var selected_units: Array = []

func _ready() -> void:
print("Iron Front başladı!")

func _process(delta: float) -> void:
_handle_camera(delta)

func _handle_camera(delta: float) -> void:
var cam: Camera2D = $Camera2D
if Input.is_action_pressed("ui_left"):
cam.position.x -= cam_speed * delta
if Input.is_action_pressed("ui_right"):
cam.position.x += cam_speed * delta
if Input.is_action_pressed("ui_up"):
cam.position.y -= cam_speed * delta
if Input.is_action_pressed("ui_down"):
cam.position.y += cam_speed * delta
