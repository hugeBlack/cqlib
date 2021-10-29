const {v4 : v4uuid} = require("uuid");
const ws = require("ws");
var commandHandler=async ()=>{};
var messageHandler=async ()=>{};
var unresolvedCommandBuffer=new Map();
var sockDataBeforeConnect=[];
var sock = new ws("ws://127.0.0.1:8848");
sock.on("open", function () {
    console.log("connect success !");
    while(sockDataBeforeConnect.length>0){
        sock.send(sockDataBeforeConnect.shift());
    }
});
sock.on("message",async (data)=>{
    var dataObj = JSON.parse(data);
    switch (dataObj.msgType){
        case "COMMAND":
            var commandFeedBack = (await commandHandler(dataObj.data.dataObj,dataObj.data.paraList));
            sendCommandToCqlib("resolveUserCommand",{commandFeedBack:commandFeedBack,uuid:dataObj.data.uuid},EMPTYFUNC);
            break;
        case "ECHO":
            var commandEchoHandler = unresolvedCommandBuffer.get(dataObj.cmdUid);
            if(typeof commandEchoHandler == "function"){
                commandEchoHandler(dataObj.data)
                unresolvedCommandBuffer.delete(dataObj.cmdUid);
            }
            break;
        case "ERROR":
            unresolvedCommandBuffer.delete(dataObj.cmdUid);
            console.warn("COMMAND ERROR: "+dataObj.data);
            break;
        case "INCOMINGMSG":
            messageHandler(dataObj.data);
            break;
    }
})
sock.on("error",function(err){
    console.warn(err);
})

var sendCommandToCqlib = (command,parament,handler)=>{
    var uuid=v4uuid();
    var data = JSON.stringify({command:command,parament:parament,cmdUid:uuid})
    if(sock.readyState==1){
        sock.send(data);
    }else{
        sockDataBeforeConnect.push(data);
    }
    
    unresolvedCommandBuffer.set(uuid,handler);
}
var onCommand=(handler)=>{
    commandHandler=handler;
}
var onMessage=(handler)=>{
    messageHandler=handler;
}
var setAppName=(appName)=>{
    sendCommandToCqlib("setName",{name:appName},()=>{})
}
var addListeningGroup=(gid)=>{
    if(typeof gid !="number"){
        throw "gid is not a number."
    }
    sendCommandToCqlib("addListeningGroup",{gid:gid})
}
var removeListeningGroup=(gid)=>{
    if(typeof gid !="number"){
        throw "gid is not a number."
    }
    sendCommandToCqlib("removeListeningGroup",{gid:gid})
}
var sendGroupMsg=(cqmsg,gid)=>{
    sendCommandToCqlib("sendGroupMsg",{gid:gid,message:cqmsg})
}
module.exports.sendCommand=sendCommandToCqlib;
module.exports.setAppName = setAppName;
module.exports.onCommand = onCommand;
module.exports.onMessage = onMessage;
module.exports.sendGroupMsg = sendGroupMsg;
module.exports.addListeningGroup = addListeningGroup;
module.exports.removeListeningGroup = removeListeningGroup;
const EMPTYFUNC=()=>{};
module.exports.EMPTYFUNC=EMPTYFUNC;