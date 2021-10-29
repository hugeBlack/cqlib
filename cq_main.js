const spawn = require('child_process').spawn;
const ws = require("ws")
const path = require("path");
const {v4:uuidv4} = require("uuid");
const cq = spawn(path.join(__dirname, "./cqExe/go-cqhttp"),['faststart'],{cwd:__dirname+"/cqExe"});
var isStart = false;
var sock;
cq.stdout.on('data', (data) => {
    console.log(`stdout: ${data.toString()}`);
});

cq.stderr.on('data', (data) => {
    console.log(data.toString());
    if (!isStart && data.indexOf("アトリは、高性能ですから!") > 0) {
        consoleOut(114514);
        isStart = true;
        sock = new ws(`ws://127.0.0.1:6700`);
        sock.on("open", function () {
            consoleOut("connect success !");
        });

        sock.on("error", function (err) {
            console.log("error: ", err);
            console.error("connect failed: Did you input the right accessToken? Or, did you start CQ?");
        });

        sock.on("close", function () {
            console.log("close");
            process.exit(1);
        });

        sock.on("message", function (data) {
            msgHandler(data.toString())
        });
    }
});

cq.on('close', (code) => {
    console.error(`child process exited with code ${code}`);
    process.exit();
});
function consoleOut(msg, mode = 0) {
    var perfix = `[${((new Date()) + "").replace(" GMT+0800 (中国标准时间)", "")}] `
    switch (mode) {
        case 1:
            console.warn(perfix + " [cqMainWarn] " + msg);
            break;
        case 2:
            console.error(perfix + " [cqMainErr] " + msg);
            break;
        default:
            console.info(perfix + " [cqMainInfo] " + msg);
            break;
    }
}
var commandMsgBuffer=new Map();
function msgHandler(data) {
    var dataObj = JSON.parse(data);
    if (dataObj.meta_event_type == "heartbeat") return;
    if (typeof dataObj.echo != "undefined") {
        var echoObj = JSON.parse(dataObj.echo);
        if(typeof connectionList[parseInt(echoObj.appId)]!="undefined"){
            connectionList[parseInt(echoObj.appId)].sendMessage2App("ECHO", dataObj, echoObj.cmdUid);
        }
        return;
    }
    if (typeof dataObj.message != "undefined" && dataObj.message.indexOf("!!") == 0) {
        var paraList = dataObj.message.split(" ");
        var appId = paraList[0].substr(2);
        paraList.shift();
        try {
            consoleOut(connectionList);
            connectionList.forEach((app) => {
                if (app.connection.readyState==1 && app.appName == appId && app.isListening(dataObj.group_id)) {
                    consoleOut(app.appName)
                    var uuid=uuidv4();
                    commandMsgBuffer.set(uuid,dataObj);
                    app.appCmdReceived(paraList,dataObj,uuid);
                    throw 0;
                }
            })
        } catch (e) { }
        return;
    }
    if (typeof dataObj.message != "undefined") {
        if (dataObj.message_type == "group") {
            try {
                connectionList.forEach((app) => {
                    for (gid of app.listeningGroup) {
                        if (gid == dataObj.group_id) {
                            app.sendMessage2App("INCOMINGMSG", dataObj, "n");
                            throw 1;
                        }
                    }
                })
            } catch (e) { }

        }
    }
}

var wsServer = new ws.Server({ port: 8848 });
var appIdMost = 0;
var connectionList = []
wsServer.on("connection", function (ws) {
    connectionList.push(new cqApp(ws));
    appIdMost++;
});
setInterval(()=>{
    connectionList.forEach((connection,i)=>{
        if(connection.connection.readyState>1){
            consoleOut(`app ${connection.appName} stopped.`,1);
            connectionList.splice(i,1);
        }
    })
},5000);

class cqApp {
    appId;
    connection;
    appName;
    listeningGroup = [];
    lastParsingCmdUid;
    addGroup(group) {
        this.listeningGroup.push(group);
    }
    sendMessage2App(msgType, messageObj, cmdUid = "") {
        if (cmdUid == "" && this.lastParsingCmdUid) { cmdUid = this.lastParsingCmdUid; }
        this.connection.send(JSON.stringify({ msgType: msgType, data: messageObj, cmdUid: cmdUid }))
    }
    appCmdReceived(paraList,dataObj,uuid) {
        this.sendMessage2App("COMMAND", {paraList:paraList,dataObj:dataObj,uuid:uuid}, "n");
    }
    issueCommand(command, args) {
        sock.send(JSON.stringify({
            action: command,
            params: args,
            echo: JSON.stringify({ appId: this.appId, cmdUid: this.lastParsingCmdUid })
        }))
    }
    sendMsgPrivate(message, uid, group) {
        if (group) {
            this.issueCommand("send_private_msg", { message: `[${this.appName}] ${message}`, user_id: uid, group_id: group });
        } else {
            this.issueCommand("send_private_msg", { message: `[${this.appName}] ${message}`, user_id: uid });
        }

    }
    sendMsgGroup(message, group) {
        this.issueCommand("send_group_msg", { message: `[${this.appName}] ${message}`, group_id: group });
    }
    sendError(error) {
        this.sendMessage2App("ERROR", error);
    }
    appCommandReader(msg) {
        var msgObj = JSON.parse(msg);

        try {
            if (!msgObj.cmdUid) {
                this.lastParsingCmdUid = ""
                throw "invalid command:no cmdUid"
            }
            this.lastParsingCmdUid = msgObj.cmdUid;
            switch (msgObj.command) {
                default:
                    throw "invalid command " + msgObj.command;
                case "sendGroupMsg":
                    if (!msgObj.parament || !msgObj.parament.message || !msgObj.parament.gid) throw "parament required:(message,gid)";
                    this.sendMsgGroup(msgObj.parament.message, msgObj.parament.gid);
                    break;
                case "sendPrivateMsg":
                    if (!msgObj.parament || !msgObj.parament.message || !msgObj.parament.uid) throw "parament required:(message,uid)";
                    this.sendMsgPrivate(msgObj.parament.message, msg.parament.uid);
                    break;
                case "sendGroupPrivateMsg":
                    if (!msgObj.parament || !msgObj.parament.message || !msgObj.parament.gid || !msgObj.parament.uid) throw "parament required:(message,uid,gid,uid)";
                    this.sendMsgPrivate(msgObj.parament.message, msg.parament.uid, msgObj.parament.gid)
                    break;
                case "setName":
                    if (!msgObj.parament || !msgObj.parament.name) throw "parament required:(name)"
                    this.appName = msgObj.parament.name;
                    this.sendMessage2App("ECHO", "appName set.");
                    consoleOut("app name changed: "+this.appName);
                    break;
                case "addListeningGroup":
                    if (!msgObj.parament || typeof msgObj.parament.gid != "number") throw "parament required:(gid:number)"
                    for (var gid of this.listeningGroup) {
                        if (gid == msgObj.parament.gid) {
                            throw `already listening group ${gid}`
                        }
                    }
                    this.listeningGroup.push(msgObj.parament.gid);
                    this.sendMessage2App("ECHO", `listening group ${msgObj.parament.gid}`);
                    break;
                case "removeListeningGroup":
                    if (!msgObj.parament || typeof msgObj.parament.gid != "number") throw "parament required:(gid:number)"
                    var found=false;
                    try{
                    this.listeningGroup.forEach((gid,i) => {
                        if(gid==msgObj.parament.gid){
                            this.listeningGroup.splice(i,1);
                            this.sendMessage2App("ECHO", `stop listening group ${msgObj.parament.gid}`);
                            throw 1;
                        }
                    });
                    }catch(e){
                        if(e==1){found=true};
                    }
                    if(!found){
                        throw `already not listening group ${msgObj.parament.gid}`
                    }
                    break;
                case "resolveUserCommand":
                    var commandMsgObj = commandMsgBuffer.get(msgObj.parament.uuid);
                    commandMsgBuffer.delete(msgObj.parament.uuid);
                    if(commandMsgObj.message_type=="group"){
                        this.sendMsgGroup(`[CQ:reply,id=${commandMsgObj.message_id	}]${msgObj.parament.commandFeedBack}`,commandMsgObj.group_id);
                    }
                    break;
            }
        } catch (e) {
            if (typeof e != "object") {
                this.sendError(e)
            } else {
                consoleOut(e.stack,2)
                throw e;
            }
        }
    }
    isListening(gid){
        for(var group of this.listeningGroup){
            if(gid==group){
                return true;
            }
        }
        return false;
    }
    constructor(ws) {
        this.connection = ws;
        this.appName = "app" + (appIdMost);
        this.appId = appIdMost;
        ws.on("message", (msg) => {
            consoleOut(msg)
            this.appCommandReader(msg);
        })
    }

}