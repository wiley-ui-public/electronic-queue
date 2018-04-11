'use strict';

const express = require('express');
const _ = require('lodash');
const app = express();
const path = require('path');
const fs = require('fs');

const host = process.env.host || 'localhost';
const port = process.env.port || 443;


const privateKeyPath = process.env.CERT_PRIVATE_KEY || './etc/localhost-cert/localhost.server.key';
const publicKeyPath = process.env.CERT_PUBLIC_KEY || './etc/localhost-cert/localhost.server.crt';

const privateKey = fs.readFileSync(privateKeyPath).toString();
const certificate = fs.readFileSync(publicKeyPath).toString();

const options = {
    key : privateKey,
    cert : certificate
};
const https = require('https');
const server = https.createServer(options, app);
const io = require('socket.io')(server);


configureStatic();
configureSocket();

server.listen(port, host);


function configureStatic() {
    app.use('/socket.io/socket.io.js', express.static(path.resolve(__dirname, '../node_modules/socket.io-client/socket.io.js')));
    app.use('/', express.static('static'));
}

function configureSocket() {
    var tickets = [];
    var ticketCounter = 0;
    var currentTopTicket;
    var clientToRates = new Map();


    function emitClientRate(socket, rate) {
        socket.emit('onClientRateUpdated', rate);
    }
      function emitUpdateRates (socket) {
        var rateValues = Array.from(clientToRates.values());
        console.log(socket.id, rateValues);
        socket.emit('onRatesUpdated', { rates:rateValues });
      }

    io.on('connection', function(socket){
        var activeTicket;

        updateClientRate(socket, '0');

        socket.on('disconnect', function() {
            console.log('Got disconnect!');
            clientToRates.delete(socket.id);
            emitUpdateRates(io);
            removeActiveTicket(false);
        });

        socket.on('echo',function(data){
            socket.emit('echo', data);
        });
        socket.on('handsUp', function () {
            if (activeTicket) {
                removeActiveTicket();
            }
            var ticketId = ticketCounter++;
            var ticketInfo = { id: ticketId, time: (Date.now()) };
            activeTicket = ticketInfo;
            tickets.push(ticketInfo);
            socket.emit('onTicketActivated', ticketInfo);
            checkAndUpdateTopMostTicket();
        });
        socket.on('handsDown', removeActiveTicket);
        socket.on('rate', updateClientRate.bind(this, socket));

          function updateClientRate(socket, rate) {
              console.log(socket.id, rate);
            clientToRates.set(socket.id, rate);
            emitClientRate(socket, rate);
            emitUpdateRates(io);
          }

        function removeActiveTicket(emitNotif) {
            var oldActiveTicket = activeTicket;
            activeTicket = undefined;
            tickets = tickets.filter(function (item) { return item !== oldActiveTicket });
            checkAndUpdateTopMostTicket();
            !emitNotif && socket.emit('onTicketRemoved', oldActiveTicket);
            emitUpdateRates(io);
        }
        emitTopTicket(socket);
        emitUpdateRates(socket);
        socket.emit('welcome', function () {});
    });



    function checkAndUpdateTopMostTicket() {
        if (currentTopTicket !== _.first(tickets)) {
            currentTopTicket = _.first(tickets);
        }
        emitTopTicket(io);
    }

    function emitTopTicket(socket) {
        const data = { ticket:currentTopTicket, totalCount: tickets.length};
        console.log('emit update', JSON.stringify(data));
        socket.emit('updateTopMostTicket', data);
    }
}
