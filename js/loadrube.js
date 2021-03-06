
Object.prototype.hasOwnProperty = function(property) {
    return typeof(this[property]) !== 'undefined'
};

// Apply multiple properties at once when loading bodies, fixtures, and joints
function applyProperties(source, dest, props) {
  for(var i = 0; i < props.length; ++i) {
    var srcName, destName;
    if(typeof props[i] == "string") // Source and destination names are the same
      srcName = destName = props[i];
    else {  // Must be a 2-member array with source and destination names
      srcName = props[i][0];
      destName = props[i][1];
    }
    if(source.hasOwnProperty(srcName))
      dest[destName] = source[srcName];
  }
}

function loadBodyFromRUBE(bodyJso, world) {
    //console.log(bodyJso);

    var bd = new b2BodyDef();
    switch(bodyJso.type) {
      case undefined:
        console.log("Body does not have a 'type' property");
        return null;
      case 1: bd.type = b2_kinematicBody; break;
      case 2: bd.type = b2_dynamicBody; break;
    }
    applyProperties(bodyJso, bd, ['angle', 'angularVelocity', ['active', 'awake'], 'fixedRotation', 'name', 'customProperties']);
    if ( bodyJso.hasOwnProperty('linearVelocity') && bodyJso.linearVelocity instanceof Object )
        bd.linearVelocity.SetV( bodyJso.linearVelocity );
    if ( bodyJso.hasOwnProperty('position') && bodyJso.position instanceof Object )
        bd.position.SetV( bodyJso.position );
    if ( bodyJso.hasOwnProperty('awake') )
        bd.awake = bodyJso.awake;
    else
        bd.awake = false;
    var body = world.CreateBody(bd);
    if ( bodyJso.hasOwnProperty('fixture') ) {
        for (k = 0; k < bodyJso['fixture'].length; k++) {
            var fixtureJso = bodyJso['fixture'][k];
            loadFixtureFromRUBE(body, fixtureJso);
        }
    }
    return body;
}

function loadFixtureFromRUBE(body, fixtureJso) {    
    //console.log(fixtureJso);
    var fixture = null;
    var fd = new b2FixtureDef();
    applyProperties(fixtureJso, fd, ['friction', 'density', 'restitution', ['sensor', 'isSensor']]);
    applyProperties(fixtureJso, fd.filter, [['filter-categoryBits', 'categoryBits'], ['filter-maskBits', 'maskBits'], ['filter-groupIndex', 'groupIndex']]);
    if (fixtureJso.hasOwnProperty('circle')) {
        fd.shape = new b2CircleShape();
        fd.shape.m_radius = fixtureJso.circle.radius;
        if ( fixtureJso.circle.center )
            fd.shape.m_p.SetV(fixtureJso.circle.center);
        fixture = body.CreateFixture(fd);        
        if ( fixtureJso.name )
            fixture.name = fixtureJso.name;
    }
    else if (fixtureJso.hasOwnProperty('polygon')) {
        fd.shape = new b2PolygonShape();
        var verts = [];
        for (v = 0; v < fixtureJso.polygon.vertices.x.length; v++) 
           verts.push( new b2Vec2( fixtureJso.polygon.vertices.x[v], fixtureJso.polygon.vertices.y[v] ) );
        fd.shape.SetAsArray(verts, verts.length);
        fixture = body.CreateFixture(fd);        
        if ( fixture && fixtureJso.name )
            fixture.name = fixtureJso.name;
    }
    else if (fixtureJso.hasOwnProperty('chain')) {
        fd.shape = new b2PolygonShape();
        var lastVertex = new b2Vec2();
        for (v = 0; v < fixtureJso.chain.vertices.x.length; v++) {
            var thisVertex = new b2Vec2( fixtureJso.chain.vertices.x[v], fixtureJso.chain.vertices.y[v] );
            if ( v > 0 ) {
                fd.shape.SetAsEdge( lastVertex, thisVertex );
                fixture = body.CreateFixture(fd);        
                if ( fixtureJso.name )
                    fixture.name = fixtureJso.name;
            }
            lastVertex = thisVertex;
        }
    }
    else {
        console.log("Could not find shape type for fixture");
    }
    
    if ( fixture ) {        
        if ( fixtureJso.hasOwnProperty('customProperties') )
            fixture.customProperties = fixtureJso.customProperties;
    }
}

function getVectorValue(val) {
    if ( val instanceof Object )
        return val;
    else
        return { x:0, y:0 };
}

function loadJointCommonProperties(jd, jointJso, loadedBodies) {    
    jd.bodyA = loadedBodies[jointJso.bodyA];
    jd.bodyB = loadedBodies[jointJso.bodyB];
    jd.localAnchorA.SetV( getVectorValue(jointJso.anchorA) );
    jd.localAnchorB.SetV( getVectorValue(jointJso.anchorB) );
    if ( jointJso.collideConnected )
        jd.collideConnected = jointJso.collideConnected;
}

function loadJointFromRUBE(jointJso, world, loadedBodies)
{
    if ( ! jointJso.hasOwnProperty('type') ) {
        console.log("Joint does not have a 'type' property");
        return null;
    }    
    if ( jointJso.bodyA >= loadedBodies.length ) {
        console.log("Index for bodyA is invalid: " + jointJso.bodyA );
        return null;
    }    
    if ( jointJso.bodyB >= loadedBodies.length ) {
        console.log("Index for bodyB is invalid: " + jointJso.bodyB );
        return null;
    }
    
    var joint = null;
    if ( jointJso.type == "revolute" ) {
        var jd = new b2RevoluteJointDef();
        loadJointCommonProperties(jd, jointJso, loadedBodies);
        applyProperties(jointJso, jd, ['refAngle', 'referenceAngle'], ['lowerLimit', 'lowerAngle'], ['upperLimit', 'upperAngle'], 'maxMotorTorque', 'motorSpeed', 'enableLimit', 'enableMotor');
        joint = world.CreateJoint(jd);
    }
    else if ( jointJso.type == "distance" || jointJso.type == "rope" ) {
        if ( jointJso.type == "rope" )
            console.log("Replacing unsupported rope joint with distance joint!");
        var jd = new b2DistanceJointDef();
        loadJointCommonProperties(jd, jointJso, loadedBodies);
        applyProperties(jointJso, jd, ['length', 'dampingRatio', ['frequency', 'frequencyHz']]);
        joint = world.CreateJoint(jd);
    }
    else if ( jointJso.type == "prismatic" ) {
        var jd = new b2PrismaticJointDef();
        loadJointCommonProperties(jd, jointJso, loadedBodies);
        if ( jointJso.hasOwnProperty('localAxisA') )
            jd.localAxisA.SetV( getVectorValue(jointJso.localAxisA) );         
        applyProperties(jointJso, jd, [['refAngle', 'referenceAngle'], 'enableLimit', ['lowerLimit', 'lowerTranslation'], ['upperLimit', 'upperTranslation'], 'enableMotor', 'maxMotorForce', 'motorSpeed']);
        joint = world.CreateJoint(jd);
    }
    else if ( jointJso.type == "wheel" ) {
        //Make a fake wheel joint using a line joint and a distance joint.
        //Return the line joint because it has the linear motor controls.
        //Use ApplyTorque on the bodies to spin the wheel...
        
        var jd = new b2DistanceJointDef();
        loadJointCommonProperties(jd, jointJso, loadedBodies);
        jd.length = 0.0;
        applyProperties(jointJso, jd, [['springDampingRatio', 'dampingRatio'], ['springFrequency', 'frequencyHz']]);
        world.CreateJoint(jd);
        
        jd = new b2LineJointDef();
        loadJointCommonProperties(jd, jointJso, loadedBodies);
        if ( jointJso.hasOwnProperty('localAxisA') )
            jd.localAxisA.SetV( getVectorValue(jointJso.localAxisA) );
            
        joint = world.CreateJoint(jd);
    }
    else if ( jointJso.type == "friction" ) {
        var jd = new b2FrictionJointDef();
        loadJointCommonProperties(jd, jointJso, loadedBodies);
        applyProperties(jointJso, jd, ['maxForce', 'maxTorque']);
        joint = world.CreateJoint(jd);
    }
    else if ( jointJso.type == "weld" ) {
        var jd = new b2WeldJointDef();
        loadJointCommonProperties(jd, jointJso, loadedBodies);
        applyProperties(jointJso, jd, ['referenceAngle']);
        joint = world.CreateJoint(jd);
    }
    else {
        console.log("Unsupported joint type: " + jointJso.type);
        console.log(jointJso);
    }
    if ( joint ) {
        if ( jointJso.name )
            joint.name = jointJso.name;
        if ( jointJso.hasOwnProperty('customProperties') )
            joint.customProperties = jointJso.customProperties;
    }
    return joint;
}

function makeClone(obj) {
  var newObj = (obj instanceof Array) ? [] : {};
  for (var i in obj) {
    if (obj[i] && typeof obj[i] == "object") 
      newObj[i] = makeClone(obj[i]);
    else
        newObj[i] = obj[i];
  }
  return newObj;
};

function loadImageFromRUBE(imageJso, world, loadedBodies)
{
    var image = makeClone(imageJso);
    
    if ( image.hasOwnProperty('body') && image.body >= 0 )
        image.body = loadedBodies[image.body];//change index to the actual body
    else
        image.body = null;
                
    if ( ! image.hasOwnProperty('aspectScale') )
        image.aspectScale = 1;
        
    image.center = new b2Vec2();
    image.center.SetV( getVectorValue(imageJso.center) );
    
    return image;
}



//mainly just a convenience for the testbed - uses global 'world' variable
function loadSceneFromRUBE(worldJso) {
    return loadSceneIntoWorld(worldJso, world);
}

//load the scene into an already existing world variable
function loadSceneIntoWorld(worldJso, world) {
    var success = true;
    
    var loadedBodies = [];
    if ( worldJso.hasOwnProperty('body') ) {
        for (var i = 0; i < worldJso.body.length; i++) {
            var bodyJso = worldJso.body[i];
            var body = loadBodyFromRUBE(bodyJso, world);
            if ( body )
                loadedBodies.push( body );
            else
                success = false;
        }
    }
    
    var loadedJoints = [];
    if ( worldJso.hasOwnProperty('joint') ) {
        for (var i = 0; i < worldJso.joint.length; i++) {
            var jointJso = worldJso.joint[i];
            var joint = loadJointFromRUBE(jointJso, world, loadedBodies);
            if ( joint )
                loadedJoints.push( joint );
            //else
            //    success = false;
        }
    }
    
    var loadedImages = [];
    if ( worldJso.hasOwnProperty('image') ) {
        for (var i = 0; i < worldJso.image.length; i++) {
            var imageJso = worldJso.image[i];
            var image = loadImageFromRUBE(imageJso, world, loadedBodies);
            if ( image )
                loadedImages.push( image );
            else
                success = false;
        }        
        world.images = loadedImages;
    }
    
    return success;
}

//create a world variable and return it if loading succeeds
function loadWorldFromRUBE(worldJso) {
    var gravity = new b2Vec2(0,0);
    if ( worldJso.hasOwnProperty('gravity') && worldJso.gravity instanceof Object )
        gravity.SetV( worldJso.gravity );
    var world = new b2World( gravity );
    if ( ! loadSceneIntoWorld(worldJso, world) )
        return false;
    return world;
}

function getNamedBodies(world, name) {
    var bodies = [];
    for (b = world.m_bodyList; b; b = b.m_next) {
        if ( b.name == name )
            bodies.push(b);
    }
    return bodies;
}

function getNamedFixtures(world, name) {
    var fixtures = [];
    for (b = world.m_bodyList; b; b = b.m_next) {
        for (f = b.m_fixtureList; f; f = f.m_next) {
            if ( f.name == name )
                fixtures.push(f);
        }
    }
    return fixtures;
}

function getNamedJoints(world, name) {
    var joints = [];
    for (j = world.m_jointList; j; j = j.m_next) {
        if ( j.name == name )
            joints.push(j);
    }
    return joints;
}

function getNamedImages(world, name) {
    var images = [];
    for (i = 0; i < world.images.length; i++) {
        if ( world.images[i].name == name )
            images.push(world.images[i].name);
    }
    return images;
}

//custom properties
function objectMatchesForCustomProperty(obj, propertyType, propertyName, valueToMatch) {
    if ( ! obj.hasOwnProperty('customProperties') )
        return false;
    for (var i = 0; i < obj.customProperties.length; i++) {
        if ( ! obj.customProperties[i].hasOwnProperty("name") )
            continue;
        if ( ! obj.customProperties[i].hasOwnProperty(propertyType) )
            continue;
        if ( obj.customProperties[i].name == propertyName &&
             obj.customProperties[i][propertyType] == valueToMatch)
            return true;
    }
    return false;
}

function getBodiesByCustomProperty(world, propertyType, propertyName, valueToMatch) {
    var bodies = [];
    for (var body = world.m_bodyList; body; body = body.m_next) {
        if ( objectMatchesForCustomProperty(body, propertyType, propertyName, valueToMatch) )
            bodies.push(body);
    }
    return bodies;
}

function getFixturesByCustomProperty(world, propertyType, propertyName, valueToMatch) {
    var fixtures = [];
    for (var body = world.m_bodyList; body; body = body.m_next) {
	for (var fixture = body.m_fixtureList; fixture; fixture = fixture.m_next) {
            if ( objectMatchesForCustomProperty(fixture, propertyType, propertyName, valueToMatch) )
                fixtures.push(fixture);
        }
    }
    return fixtures;
}

function getJointsByCustomProperty(world, propertyType, propertyName, valueToMatch) {
    var joints = [];
    for (var joint = world.m_jointList; joint; joint = joint.m_next) {
        if ( objectMatchesForCustomProperty(joint, propertyType, propertyName, valueToMatch) )
            joints.push(joint);
    }
    return joints;
}

function getImagesByCustomProperty(world, propertyType, propertyName, valueToMatch) {
    var images = [];    
    for (var i = 0; i < world.images.length; i++) {
        if ( objectMatchesForCustomProperty(world.images[i], propertyType, propertyName, valueToMatch) )
            images.push(world.images[i]);
    }
    return images;
}

function hasCustomProperty(item, propertyType, propertyName) {
    if ( !item.hasOwnProperty('customProperties') )
        return false;
    for (var i = 0; i < item.customProperties.length; i++) {
        if ( ! item.customProperties[i].hasOwnProperty("name") )
            continue;
        if ( ! item.customProperties[i].hasOwnProperty(propertyType) )
            continue;
        return true;
    }
    return false;
}

function getCustomProperty(item, propertyType, propertyName, defaultValue) {
    if ( !item.hasOwnProperty('customProperties') )
        return defaultValue;
    for (var i = 0; i < item.customProperties.length; i++) {
        if ( ! item.customProperties[i].hasOwnProperty("name") )
            continue;
        if ( ! item.customProperties[i].hasOwnProperty(propertyType) )
            continue;
        if ( item.customProperties[i].name == propertyName )
            return item.customProperties[i][propertyType];
    }
    return defaultValue;
}
