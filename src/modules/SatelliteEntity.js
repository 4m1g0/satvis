import { SatelliteOrbit } from "./SatelliteOrbit";
//import Cesium from "cesium/Cesium";

// Import webpack externals
import Cesium from "Cesium";
import CesiumSensorVolumes from "CesiumSensorVolumes";

export class SatelliteEntity {
  constructor(viewer, tle) {
    this.viewer = viewer;

    this.name = tle.split("\n")[0];
    if (tle.startsWith("0 ")) {
      this.name = this.name.substring(2);
    }
    this.orbit = new SatelliteOrbit(tle);
    this.size = 1000;

    this.createEntities();
  }

  show() {
    for (var entity in this.entities) {
      this.showComponent(entity);
    }
  }

  get components() {
    return Object.keys(this.entities);
  }

  showComponent(name) {
    if (typeof name === "undefined") {
      return;
    }
    if (name in this.entities && ! this.viewer.entities.contains(this.entities[name])) {
      this.viewer.entities.add(this.entities[name]);
    }
  }

  hide() {
    for (var entity in this.entities) {
      this.hideComponent(entity);
    }
  }

  hideComponent(name) {
    if (typeof name === "undefined") {
      return;
    }
    if (name in this.entities && this.viewer.entities.contains(this.entities[name])) {
      this.viewer.entities.remove(this.entities[name]);
    }
  }

  track(animate = false) {
    if (typeof this.defaultEntity === "undefined") {
      return;
    }
    if (!animate) {
      this.viewer.trackedEntity = this.defaultEntity;
      return;
    }

    this.viewer.trackedEntity = undefined;
    const clockRunning = this.viewer.clock.shouldAnimate;
    this.viewer.clock.shouldAnimate = false;

    const offset = new Cesium.HeadingPitchRange(0, -Cesium.Math.PI_OVER_FOUR, 1580000);
    this.viewer.flyTo(this.defaultEntity, { offset }).then((result) => {
      if (result) {
        this.viewer.trackedEntity = this.defaultEntity;
        this.viewer.clock.shouldAnimate = clockRunning;
      }
    });
  }

  get isTracked() {
    return this.viewer.trackedEntity === this.defaultEntity;
  }

  artificiallyTrack() {
    const cameraTracker = new Cesium.EntityView(this.defaultEntity, this.viewer.scene, this.viewer.scene.globe.ellipsoid);

    const onTickEventRemovalCallback = this.viewer.clock.onTick.addEventListener((clock) => {
      cameraTracker.update(clock.currentTime);
    });
    const onTrackedEntityChangedRemovalCallback = this.viewer.trackedEntityChanged.addEventListener(() => {
      onTickEventRemovalCallback();
      onTrackedEntityChangedRemovalCallback();
    });
  }

  createEntities() {
    this.entities = {};
    this.positionProperty = new Cesium.CallbackProperty((time) => {
      const position = this.orbit.computeOrbitTrack(Cesium.JulianDate.toDate(time), 1);
      return Cesium.Cartesian3.fromRadians(position[0], position[1], position[2]);
    }, false);
    this.createSatellite();
    this.createOrbitTrack();
    this.createGroundTrack();
    this.createCone();

    this.viewer.trackedEntityChanged.addEventListener(() => {
      if (this.isTracked) {
        this.artificiallyTrack();
      }
    });
  }

  createSatellite() {
    const label = new Cesium.LabelGraphics({
      text: this.name,
      scale: 0.8,
      horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
      pixelOffset: new Cesium.Cartesian2(20, 0),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(this.size * 10, 5.0e7),
      pixelOffsetScaleByDistance: new Cesium.NearFarScalar(1.0e1, 10, 2.0e5, 1),
    });

    const point = new Cesium.PointGraphics({
      pixelSize: 10,
      color: Cesium.Color.WHITE,
    });

    const box = new Cesium.BoxGraphics({
      dimensions: new Cesium.Cartesian3(this.size, this.size, this.size),
      material: Cesium.Color.WHITE,
    });

    this.entities["Satellite"] = new Cesium.Entity({
      box: box,
      label: label,
      name: this.name,
      point: point,
      viewFrom: new Cesium.Cartesian3(0, -1200000, 1150000),
      position: this.positionProperty
    });
    this.defaultEntity = this.entities["Satellite"];
  }

  createOrbitTrack() {
    const polyline = new Cesium.PolylineGraphics({
      material: Cesium.Color.WHITE.withAlpha(0.2),
      positions: new Cesium.CallbackProperty((time) => {
        return Cesium.Cartesian3.fromRadiansArrayHeights(
          this.orbit.computeOrbitTrack(Cesium.JulianDate.toDate(time)));
      }, false),
      width: 5,
    });

    this.entities["OrbitTrack"] = new Cesium.Entity({
      polyline: polyline
    });
  }

  createGroundTrack() {
    const polyline = new Cesium.PolylineGraphics({
      material : new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.WHITE.withAlpha(0.5)
      }),
      positions: new Cesium.CallbackProperty((time) => {
        const orbitTrackPositions = this.orbit.computeOrbitTrack(Cesium.JulianDate.toDate(time));
        const groundTrackPositions = [];
        for (let i = 0; i < orbitTrackPositions.length; i++) {
          if ((i + 1) % 3 === 0) {
            groundTrackPositions[i] = 0;
          } else {
            groundTrackPositions[i] = orbitTrackPositions[i];
          }
        }
        return Cesium.Cartesian3.fromRadiansArrayHeights(groundTrackPositions);
      }, false),
      width: 5,
    });

    this.entities["GroundTrack"] = new Cesium.Entity({
      polyline: polyline
    });
  }

  createCone(fov = 10) {
    const cone = new Cesium.Entity({
      position: this.positionProperty,
      orientation: new Cesium.CallbackProperty((time) => {
        const position = this.orbit.computeOrbitTrack(Cesium.JulianDate.toDate(time), 1);
        const positionCartesian = new Cesium.Cartesian3.fromRadians(position[0], position[1], position[2]);
        const hpr = new Cesium.HeadingPitchRoll(0, Cesium.Math.toRadians(180), 0);
        return Cesium.Transforms.headingPitchRollQuaternion(positionCartesian, hpr);
      }, false),
    });

    cone.addProperty("conicSensor");
    cone.conicSensor = new CesiumSensorVolumes.ConicSensorGraphics({
      radius: 10000000,
      innerHalfAngle: Cesium.Math.toRadians(0),
      outerHalfAngle: Cesium.Math.toRadians(fov),
      lateralSurfaceMaterial: Cesium.Color.GOLD.withAlpha(0.15),
      intersectionColor: Cesium.Color.GOLD.withAlpha(0.3),
      intersectionWidth: 1,
    });
    this.entities["Cone"] = cone;
  }
}