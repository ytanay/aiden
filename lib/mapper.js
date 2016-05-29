/**
 * Routines for selecting and exploring nodes on the network
 */

var _ = require('lodash');
var url = require('url');

var Directory = require('./directory');
var Interface = require('../ui');
var Security = require ('./security');
var CONFIG = require('../config');

var Mapper = module.exports = {

  nodes: {}, // A map of all known nodes on the network <PUBLIC_ADDRESS:NODE_DATA>
  secondaries: {},

  /**
   * Updates the list of locally-known friend nodes
   * @param  {object} nodes flat map of nodes
   */
  update: function(nodes, secondaries){
    delete nodes[Directory.self]; // Guarantee this node is not on the list

    if(_.keys(nodes).length !== _.keys(Mapper.nodes).length) // Write a line to the console if new nodes are added or removed (by count)
      console.log('Mapper.update: regenerating maps. #(nodes)=%s, #(secondaries)', _.keys(nodes).length, _.keys(secondaries).length);

    //TODO: refactor stat push to pull convention.
    Interface.stat('known-nodes', _.keys(nodes).length, 'persist'); // Pass the number of known nodes to the Interface

    for(node in nodes){ // For each node in the list
      nodes[node].key = Security.processKey(nodes[node].key); // Parse its public key
    }

    Mapper.nodes = nodes; // Export the node list
    Mapper.secondaries = secondaries;

  },

  /**
   * Runs a generic sample of known friend nodes and selects one based on a predetrmined strategy
   *
   * NOTE/TODO: Reimplement BEST_OF(*) and GEO_MIN_OF(*) strategies - benchmark!
   *
   * Perviously we greedily filtered the list of friend nodes by minimizing the
   * geographical distance (based on the public IP address), and regularly
   * testing the latency between this node and each of its peers. However, we
   * have determined this places undue stress of the network (exponential
   * growth of tests/time unit).
   *
   * Our new model works as follows:
   *   1. For the first requests, begin by randomly sampling friend nodes, and
   *      measure ping/transfer rate on a request by request basis
   *   2. For later requests (n ~> NODE_COUNT/10), sample from a list of the
   *      fastest known nodes for SOCIALIZATION_FACTOR of requests and pick
   *      randomly for all others.
   *   3. This aims to guarantee implicit load-balancing on the network.
   *
   * @return {NodeDescriptor}
   */
  select: function(){
    var id = _.sample(_.keys(Mapper.nodes));
    return {
      id,
      address: url.parse('http://' + id),
      key: Mapper.nodes[id].key
    };
  },

  parse: function(address){
    return url.parse('http://' + address)
  },

  /**
   * Get a node by its address
   * @return {NodeDescriptor:FLAT}
   */
  get: function(address){
    return Mapper.nodes[address];
  },

  getSecondary: function(id){
    console.log('secondary id=%s val=%s', id, Mapper.secondaries[id])
    return Security.processKey(Mapper.secondaries[id]);
  },

  /**
   * Remove a misbehaving node from the local list and recommend ejection to the directory
   * @param  {string} address of failed node
   */
  eject: function(address){
    console.log('Mapper.eject: removing node. address=%s', address);
    delete Mapper.nodes[address];
    Directory.eject(address);
  },

  /**
   * Manually add a new node to our friend list
   * @param  {string}              address public ip address of new node
   * @param  {NodeDescriptor:FLAT} data    flat node descriptor
   */
  add: function(address, data){
    console.log('Added new node', address, data);
    Mapper.nodes[address] = data;
  }

}
