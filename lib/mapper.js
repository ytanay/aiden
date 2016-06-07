/**
 * Routines for selecting and exploring nodes on the network
 */

var _ = require('lodash');
var url = require('url');

var Directory = require('./directory');
var Interface = require('../ui');
var Security = require ('./security');
var CONFIG = require('../config');

// Enum properties:
var TRUSTED_NODE = 1;

/**
 * A lambda function to filter trusted ndoes
 * @param {NodeDescriptor} node to test
 */
function LAMBDA_TEST_TRUSTED_NODE(node){
  return node.trusted;
}

/**
 * A lambda function to aid in ranking nodes
 * @param {NodeDescriptor} node to test
 */
function LAMBDA_RANK_NODE(node){
  return node.averageTransmitRate;
}

var Mapper = module.exports = {

  TRUSTED_NODE,

  nodes: {}, // A map of all known nodes on the network <PUBLIC_ADDRESS:NODE_DATA>
  secondaries: {}, // A map of secondary encryption keys <UNIQUE_ID:KEY>
  benchmarks: {}, // A map of benchmarked nodes

  /**
   * Updates the list of locally-known friend nodes
   * @param  {object} nodes flat map of nodes
   */
  update: function(nodes, secondaries){
    delete nodes[Directory.self]; // Guarantee this node is not on the list

    if(_.keys(nodes).length !== _.keys(Mapper.nodes).length) // Write a line to the console if new nodes are added or removed (by count)
      console.log('Mapper.update: regenerating maps. #(nodes)=%s, #(secondaries)', _.keys(nodes).length, _.keys(secondaries).length);


    Interface.stat('known-nodes', _.keys(nodes).length, 'persist'); // Pass the number of known nodes to the Interface

    for(node in nodes){ // For each node in the list
      nodes[node].key = Security.processKey(nodes[node].key); // Parse its public key
    }

    Mapper.nodes = nodes; // Export the node list
    Mapper.secondaries = secondaries; // Export the secondary public keys
    Mapper.trustedNodes = CONFIG.TRUST_ALL_NODES ? nodes : _.pickBy(nodes, LAMBDA_TEST_TRUSTED_NODE); // Build list of trusted exit nodes (note: during simulations all nodes are designated as trusted by the directory)
  },

  /**
   * Runs a generic sample of known friend nodes and selects one based on a predetrmined strategy
   * @return {NodeDescriptor}
   */
  select: function(strategy){
    var nodes = Mapper.nodes;

    if(strategy === TRUSTED_NODE) // If we need a trusted node, sample directly from the generated list
      nodes = Mapper.trustedNodes;

    // Otherwise, return a regular sample
    var id = _.sample(_.keys(Mapper.nodes));
    return {
      id,
      address: url.parse('http://' + id),
      key: Mapper.nodes[id].key
    };
  },

  /**
   * Generates a number of hops to mandate for this request
   * @return {Number}
   */
  computeHops: function(){
    return _.random(CONFIG.MIN_HOPS, CONFIG.MAX_HOPS);
  },

  parse: function(address){
    return url.parse('http://' + address);
  },

  /**
   * Get a node by its address
   * @return {NodeDescriptorFlat}
   */
  get: function(address){
    console.log('looking up %s in %s', address, Object.keys(Mapper.nodes));
    return Mapper.nodes[address];
  },

  /**
   * Get a secondary key by the relevant node id
   * @return {NodeRSA}
  */
  getSecondary: function(id){
    return Security.processKey(Mapper.secondaries[id]);
  },

  /**
   * Remove a misbehaving node from the local list and recommend ejection to the directory
   * @param  {string} address of failed node
   */
  eject: function(address){
    console.warn('Mapper.eject: removing node. address=%s', address);
    delete Mapper.nodes[address];
    Directory.eject(address);
  }

}
