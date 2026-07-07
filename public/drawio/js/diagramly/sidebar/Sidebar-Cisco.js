/**
 * Copyright (c) 2020-2025, JGraph Holdings Ltd
 * Copyright (c) 2020-2025, draw.io AG
 */
(function()
{

	// Adds Salesforce stencils
	Sidebar.prototype.addCiscoPalette = function(cisco, dir)
	{
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoBuildings');
		this.addCiscoBuildingsPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoComputers and Peripherals');
		this.addCiscoComputersAndPeripheralsPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoControllers and Modules');
		this.addCiscoControllersAndModulesPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoDirectors');
		this.addCiscoDirectorsPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoHubs and Gateways');
		this.addCiscoHubsAndGatewaysPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoMisc');
		this.addCiscoMiscPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoModems and Phones');
		this.addCiscoModemsAndPhonesPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoPeople');
		this.addCiscoPeoplePalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoRouters');
		this.addCiscoRoutersPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoSecurity');
		this.addCiscoSecurityPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoServers');
		this.addCiscoServersPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoStorage');
		this.addCiscoStoragePalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoSwitches');
		this.addCiscoSwitchesPalette();
		this.setCurrentSearchEntryLibrary('cisco', 'ciscoWireless');
		this.addCiscoWirelessPalette();

		this.setCurrentSearchEntryLibrary();
	};
	
	Sidebar.prototype.addCiscoBuildingsPalette = function()
	{
		var s = 'sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.buildings.';
		var gn = 'mxgraph.cisco';
		var dt = 'cisco building ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoBuildings', 'Cisco / Buildings', false,
		[
			this.createVertexTemplateEntry(s + 'branch_office;', w * 0.51, h * 0.75, '', 'Branch Office', null, null, this.getTagsForStencil(gn, 'branch office', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'end_office;', w * 0.54, h * 0.56, '', 'End Office', null, null, this.getTagsForStencil(gn, 'end office', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'generic_building;', w * 0.9, h * 1.36, '', 'Generic Building', null, null, this.getTagsForStencil(gn, 'generic building', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'government_building;', w * 1.07, h * 0.78, '', 'Government Building', null, null, this.getTagsForStencil(gn, 'government building', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mdu;', w * 0.66, h * 0.8, '', 'MDU', null, null, this.getTagsForStencil(gn, 'mdu', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'small_business;', w * 0.98, h * 0.54, '', 'Small Business', null, null, this.getTagsForStencil(gn, 'small business', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'telecommuter_house;', w * 1.04, h * 0.88, '', 'Telecommuter House', null, null, this.getTagsForStencil(gn, 'telecommuter house', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'telecommuter_house_pc;', w * 1.04, h * 0.88, '', 'Telecommuter House PC', null, null, this.getTagsForStencil(gn, 'telecommuter house pc personal computer', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'university;', w * 1.33, h * 0.53, '', 'University', null, null, this.getTagsForStencil(gn, 'university', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoComputersAndPeripheralsPalette = function()
	{
		var s = 'sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.computers_and_peripherals.';
		var gn = 'mxgraph.cisco';
		var dt = 'cisco computer peripheral ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoComputers and Peripherals', 'Cisco / Computers and Peripherals', false,
		[
			this.createVertexTemplateEntry(s + 'ibm_mainframe;', w * 0.5, h * 0.7, '', 'IBM Mainframe', null, null, this.getTagsForStencil(gn, 'ibm mainframe', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ibm_mini_as400;', w * 0.43, h * 0.62, '', 'IBM Mini AS400', null, null, this.getTagsForStencil(gn, 'ibm mini as400', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ibm_tower;', w * 0.42, h * 0.77, '', 'IBM Tower', null, null, this.getTagsForStencil(gn, 'ibm tower', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'laptop;', w * 0.9, h * 0.61, '', 'Laptop', null, null, this.getTagsForStencil(gn, 'laptop', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'macintosh;', w * 0.99, h * 0.64, '', 'Macintosh', null, null, this.getTagsForStencil(gn, 'macintosh', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'microphone;', w * 0.8, h * 0.96, '', 'Microphone', null, null, this.getTagsForStencil(gn, 'microphone', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pc;', w * 0.78, h * 0.7, '', 'PC', null, null, this.getTagsForStencil(gn, 'pc personal computer', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pc_adapter_card;', w * 0.64, h * 0.86, '', 'PC Adapter Card', null, null, this.getTagsForStencil(gn, 'pc adapter card personal computer', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pc_routercard;', w * 0.78, h * 0.7, '', 'PC Routercard', null, null, this.getTagsForStencil(gn, 'pc routercard', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'printer;', w * 0.91, h * 0.34, '', 'Printer', null, null, this.getTagsForStencil(gn, 'printer', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'scanner;', w * 0.8, h * 0.75, '', 'Scanner', null, null, this.getTagsForStencil(gn, 'scanner', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'speaker;', w * 0.53, h * 0.94, '', 'Speaker', null, null, this.getTagsForStencil(gn, 'speaker', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'sun_workstation;', w * 0.85, h * 0.67, '', 'Sun Workstation', null, null, this.getTagsForStencil(gn, 'sun workstation', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'supercomputer;', w * 0.83, h * 0.99, '', 'Supercomputer', null, null, this.getTagsForStencil(gn, 'supercomputer', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'tablet;', w * 0.91, h * 0.5, '', 'Tablet', null, null, this.getTagsForStencil(gn, 'tablet', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'terminal;', w * 0.61, h * 0.54, '', 'Terminal', null, null, this.getTagsForStencil(gn, 'terminal', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'upc;', w * 0.91, h * 0.86, '', 'UPC', null, null, this.getTagsForStencil(gn, 'upc', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'video_camera;', w * 0.67, h * 0.98, '', 'Video Camera', null, null, this.getTagsForStencil(gn, 'video camera', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'web_browser;', w * 0.62, h * 0.64, '', 'Web Browser', null, null, this.getTagsForStencil(gn, 'web browser', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'workstation;', w * 0.83, h * 0.62, '', 'Workstation', null, null, this.getTagsForStencil(gn, 'workstation', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoControllersAndModulesPalette = function()
	{
		var s = 'sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.controllers_and_modules.';
		var gn = 'mxgraph.cisco';
		var dt = 'cisco controller module ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoControllers and Modules', 'Cisco / Controllers and Modules', false,
		[
			this.createVertexTemplateEntry(s + '10ge_fcoe;', w * 0.64, h * 0.88, '', '10GE FCoE', null, null, this.getTagsForStencil(gn, '10ge fcoe', dt).join(' ')),
			this.createVertexTemplateEntry(s + '3174_(desktop)_cluster_controller;', w * 0.77, h * 0.32, '', '3174 (Desktop) Cluster Controller', null, null, this.getTagsForStencil(gn, '3174 desktop cluster controller', dt).join(' ')),
			this.createVertexTemplateEntry(s + '3x74_(floor)_cluster_controller;', w * 0.77, h * 0.66, '', '3x74 (Floor) Cluster Controller', null, null, this.getTagsForStencil(gn, '3x74 (floor) cluster controller', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'content_switch_module;', w * 0.86, h * 0.64, '', 'Content Switch Module', null, null, this.getTagsForStencil(gn, 'content switch module', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'firewall_service_module_(fwsm);', w * 0.53, h * 0.85, '', 'Firewall Service Module(FWSM)', null, null, this.getTagsForStencil(gn, 'firewall service module fwsm', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'service_module;', w * 0.51, h * 0.66, '', 'Service Module', null, null, this.getTagsForStencil(gn, 'service module', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'system_controller;', w * 0.61, h * 0.58, '', 'System Controller', null, null, this.getTagsForStencil(gn, 'system controller', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'virtual_switch_controller_(vsc3000);', w * 0.46, h * 0.93, '', 'Virtual Switch Controller (VSC3000)', null, null, this.getTagsForStencil(gn, 'virtual switch controller vsc3000', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoDirectorsPalette = function()
	{
		var s = 'sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.directors.';
		var gn = 'mxgraph.cisco';
		var dt = 'cisco director ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoDirectors', 'Cisco / Directors', false,
		[
			this.createVertexTemplateEntry(s + 'content_engine_(cache_director);', w * 0.9, h * 0.64, '', 'Content Engine (Cache Director)', null, null, this.getTagsForStencil(gn, 'content engine cache director', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'director-class_fibre_channel_director;', w * 0.51, h * 0.69, '', 'Director-Class Fibre Channel Director', null, null, this.getTagsForStencil(gn, 'director class fibre channel', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'distributed_director;', w * 0.91, h * 0.64, '', 'Distributed Director', null, null, this.getTagsForStencil(gn, 'distributed director', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'localdirector;', w * 0.78, h * 0.51, '', 'LocalDirector', null, null, this.getTagsForStencil(gn, 'localdirector local director', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'workgroup_director;', w * 0.83, h * 0.67, '', 'Workgroup Director', null, null, this.getTagsForStencil(gn, 'workgroup director', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoHubsAndGatewaysPalette = function()
	{
		var s = 'sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.hubs_and_gateways.';
		var gn = 'mxgraph.cisco';
		var dt = 'cisco hubs and gateways ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoHubs and Gateways', 'Cisco / Hubs and Gateways', false,
		[
			this.createVertexTemplateEntry(s + '100baset_hub;', w * 0.9, h * 0.45, '', '100BaseT Hub', null, null, this.getTagsForStencil(gn, '100baset_hub', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cisco_hub;', w * 0.66, h * 0.58, '', 'Cisco Hub', null, null, this.getTagsForStencil(gn, 'cisco hub', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'generic_gateway;', w * 0.66, h * 0.74, '', 'Generic Gateway', null, null, this.getTagsForStencil(gn, 'generic gateway', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'hub;', w * 0.66, h * 0.58, '', 'Hub', null, null, this.getTagsForStencil(gn, 'hub', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mas_gateway;', w * 0.58, h * 0.59, '', 'MAS Gateway', null, null, this.getTagsForStencil(gn, 'mas gateway', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'small_hub;', w * 0.9, h * 0.45, '', 'Small Hub', null, null, this.getTagsForStencil(gn, 'small hub', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'universal_gateway;', w * 0.54, h * 0.56, '', 'Universal Gateway', null, null, this.getTagsForStencil(gn, 'universal gateway', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'vpn_gateway;', w * 0.91, h * 0.48, '', 'VPN Gateway', null, null, this.getTagsForStencil(gn, 'vpn gateway virtual private network', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoMiscPalette = function()
	{
		var s = 'sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.misc.';
		var gn = 'mxgraph.cisco';
		var dt = 'cisco misc miscellaneous ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoMisc', 'Cisco / Misc', false,
		[
			this.createVertexTemplateEntry(s + '15200;', w * 0.96, h * 0.58, '', '15200', null, null, this.getTagsForStencil(gn, '15200', dt).join(' ')),
			this.createVertexTemplateEntry(s + '6700_series;', w * 0.64, h * 0.64, '', '6700 Series', null, null, this.getTagsForStencil(gn, '6700 series', dt).join(' ')),
			this.createVertexTemplateEntry(s + '7500ars_(7513);', w * 0.78, h * 0.78, '', '7500ars (7513)', null, null, this.getTagsForStencil(gn, '7500ars 7513 7500 ars', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'access_point;', w * 0.75, h * 0.34, '', 'Access Point', null, null, this.getTagsForStencil(gn, 'access point', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ace;', w * 0.9, h * 0.64, '', 'ACE', null, null, this.getTagsForStencil(gn, 'ace', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'acs;', w * 0.75, h * 0.53, '', 'ACS', null, null, this.getTagsForStencil(gn, 'acs', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'adm;', w * 0.78, h * 0.51, '', 'ADM', null, null, this.getTagsForStencil(gn, 'adm', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'asa_5500;', w * 0.59, h * 0.67, '', 'ASA 5500', null, null, this.getTagsForStencil(gn, 'asa 5500', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'asic_processor;', w * 0.58, h * 0.83, '', 'Asic Processor', null, null, this.getTagsForStencil(gn, 'asic processor', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'asr_1000_series;', w * 0.88, h * 0.86, '', 'ASR 1000 Series', null, null, this.getTagsForStencil(gn, 'asr 1000 series', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ata;', w * 1.01, h * 0.5, '', 'ATA', null, null, this.getTagsForStencil(gn, 'ata', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'atm_3800;', w * 0.67, h * 0.75, '', 'ATM 3800', null, null, this.getTagsForStencil(gn, 'atm 3800', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'avs;', w * 0.9, h * 0.64, '', 'AVS', null, null, this.getTagsForStencil(gn, 'avs', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'axp;', w * 0.78, h * 0.74, '', 'AXP', null, null, this.getTagsForStencil(gn, 'axp', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'bbsm;', w * 1.01, h * 0.42, '', 'BBSM', null, null, this.getTagsForStencil(gn, 'bbsm', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'breakout_box;', w * 0.43, h * 0.75, '', 'Breakout Box', null, null, this.getTagsForStencil(gn, 'breakout box', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'bridge;', w * 0.74, h * 0.56, '', 'Bridge', null, null, this.getTagsForStencil(gn, 'bridge', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'bts_10200;', w * 0.5, h * 0.75, '', 'BTS 10200', null, null, this.getTagsForStencil(gn, 'bts 10200', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'call_manager;', w * 0.61, h * 0.38, '', 'Call Manager', null, null, this.getTagsForStencil(gn, 'call manager', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'car;', w * 0.69, h * 0.37, '', 'Car', null, null, this.getTagsForStencil(gn, 'car', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'carrier_routing_system;', w * 0.78, h * 0.78, '', 'Carrier Routing System', null, null, this.getTagsForStencil(gn, 'carrier routing system crs', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cddi_fddi;', w * 1.01, h * 0.5, '', 'CDDI FDDI', null, null, this.getTagsForStencil(gn, 'cddi fddi', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cdm;', w * 0.93, h * 0.59, '', 'CDM', null, null, this.getTagsForStencil(gn, 'cdm', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cisco_1000;', w * 0.53, h * 0.46, '', 'Cisco 1000', null, null, this.getTagsForStencil(gn, 'cisco 1000', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cisco_ca;', w * 0.83, h * 0.67, '', 'Cisco CA', null, null, this.getTagsForStencil(gn, 'cisco ca', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cisco_unity_express;', w * 0.77, h * 0.67, '', 'Cisco Unity Express', null, null, this.getTagsForStencil(gn, 'cisco unity express', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cisco_works;', w * 0.85, h * 0.67, '', 'Cisco Works', null, null, this.getTagsForStencil(gn, 'cisco works', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'contact_acquirer;', w * 0.96, h * 0.64, '', 'Contact Acquirer', null, null, this.getTagsForStencil(gn, 'contact acquirer', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'contact_center;', w * 0.61, h * 0.66, '', 'Contact Center', null, null, this.getTagsForStencil(gn, 'contact center', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'content_transformation_engine_(cte);', w * 0.98, h * 0.64, '', 'Content Transformation Engine(CTE)', null, null, this.getTagsForStencil(gn, 'content_transformation_engine_(cte)', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cs-mars;', w * 0.75, h * 0.5, '', 'CS-MARS', null, null, this.getTagsForStencil(gn, 'cs mars', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'csm-s;', w * 0.64, h * 0.85, '', 'CSM-S', null, null, this.getTagsForStencil(gn, 'csms csm', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'csu_dsu;', w * 1.02, h * 0.45, '', 'CSU/DSU', null, null, this.getTagsForStencil(gn, 'csu dsu', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cube;', w * 1.04, h * 0.53, '', 'Cube', null, null, this.getTagsForStencil(gn, 'cube', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'detector;', w * 0.77, h * 0.54, '', 'Detector', null, null, this.getTagsForStencil(gn, 'detector', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'dot-dot;', w * 0.37, h * 0.08, '', 'Dot-Dot', null, null, this.getTagsForStencil(gn, 'dot', dt).join(' ')),
			this.createVertexTemplateEntry('sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=none;strokeColor=none;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.misc.dpt;', w * 0.98, h * 0.48, '', 'DPT', null, null, this.getTagsForStencil(gn, 'dpt', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'dslam;', w * 0.46, h * 0.51, '', 'DSLAM', null, null, this.getTagsForStencil(gn, 'dslam', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'dual_mode;', w * 0.75, h * 0.54, '', 'Dual Mode', null, null, this.getTagsForStencil(gn, 'dual mode', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'dwdm_filter;', w * 0.51, h * 0.7, '', 'DWDM Filter', null, null, this.getTagsForStencil(gn, 'dwdm filter', dt).join(' ')),
			this.createVertexTemplateEntry('sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=none;strokeColor=#036c9b;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.misc.fddi_ring;', w * 1.36, h * 0.48, '', 'FDDI Ring', null, null, this.getTagsForStencil(gn, 'fddi ring', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'front_end_processor;', w * 0.42, h * 0.51, '', 'Front-End Processor', null, null, this.getTagsForStencil(gn, 'front end processor', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'general_appliance;', w * 0.64, h * 0.58, '', 'General Appliance', null, null, this.getTagsForStencil(gn, 'general appliance', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'generic_processor;', w * 0.58, h * 0.83, '', 'Generic Processor', null, null, this.getTagsForStencil(gn, 'generic processor', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'handheld;', w * 0.67, h * 0.37, '', 'Handheld', null, null, this.getTagsForStencil(gn, 'handheld', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'hp_mini;', w * 0.5, h * 0.54, '', 'HP Mini', null, null, this.getTagsForStencil(gn, 'hp mini', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'h_323;', w * 0.51, h * 0.51, '', 'H-323', null, null, this.getTagsForStencil(gn, '323', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'icm;', w * 0.37, h * 0.77, '', 'ICM', null, null, this.getTagsForStencil(gn, 'icm', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ics;', w * 0.7, h * 0.77, '', 'ICS', null, null, this.getTagsForStencil(gn, 'ics', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'internet_streamer;', w * 1.09, h * 0.74, '', 'Internet Streamer', null, null, this.getTagsForStencil(gn, 'internet streamer', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ios_slb;', w * 0.91, h * 0.45, '', 'iOS SLB', null, null, this.getTagsForStencil(gn, 'ios slb', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ip;', w * 0.64, h * 0.72, '', 'IP', null, null, this.getTagsForStencil(gn, 'ip internet protocol', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'iptc;', w * 1.01, h * 0.56, '', 'IPTC', null, null, this.getTagsForStencil(gn, 'iptc', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'iptv_content_manager;', w * 0.78, h * 0.51, '', 'IPTV Content Manager', null, null, this.getTagsForStencil(gn, 'iptv content manager', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ip_communicator;', w * 1.36, h * 0.74, '', 'IP Communicator', null, null, this.getTagsForStencil(gn, 'ip communicator', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ip_dsl;', w * 0.7, h * 0.64, '', 'IP DSL', null, null, this.getTagsForStencil(gn, 'ip dsl', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'itp;', w * 0.78, h * 0.53, '', 'ITP', null, null, this.getTagsForStencil(gn, 'itp', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'jbod;', w * 0.29, h * 0.62, '', 'JBOD', null, null, this.getTagsForStencil(gn, 'jbod', dt).join(' ')),
			this.createVertexTemplateEntry('sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#0f73a0;strokeColor=none;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.misc.key;', w * 0.48, h * 0.19, '', 'Key', null, null, this.getTagsForStencil(gn, 'key', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'keys;', w * 0.74, h * 0.99, '', 'Keys', null, null, this.getTagsForStencil(gn, 'keys', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'lan_to_lan;', w * 0.61, h * 0.61, '', 'LAN to LAN', null, null, this.getTagsForStencil(gn, 'lan to', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'lightweight_ap;', w * 1.01, h * 0.56, '', 'Lightweight AP', null, null, this.getTagsForStencil(gn, 'lightweight ap', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'longreach_cpe;', w * 0.61, h * 0.59, '', 'Longreach CPE', null, null, this.getTagsForStencil(gn, 'longreach cpe', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mau;', w * 0.82, h * 0.26, '', 'MAU', null, null, this.getTagsForStencil(gn, 'mau', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mcu;', w * 0.56, h * 0.64, '', 'MCU', null, null, this.getTagsForStencil(gn, 'mcu', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'me1100;', w * 0.91, h * 0.48, '', 'ME1100', null, null, this.getTagsForStencil(gn, 'me1100', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mediator;', w * 0.74, h * 0.82, '', 'Mediator', null, null, this.getTagsForStencil(gn, 'mediator', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'meetingplace;', w * 0.4, h * 0.64, '', 'Meetingplace', null, null, this.getTagsForStencil(gn, 'meetingplace', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mesh_ap;', w * 1.01, h * 0.56, '', 'Mesh AP', null, null, this.getTagsForStencil(gn, 'mesh ap', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'metro_1500;', w * 0.66, h * 0.58, '', 'Metro 1500', null, null, this.getTagsForStencil(gn, 'metro 1500', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mini_vax;', w * 0.5, h * 0.45, '', 'Mini VAX', null, null, this.getTagsForStencil(gn, 'mini vax', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mobile_streamer;', w * 1.04, h * 0.7, '', 'Mobile Streamer', null, null, this.getTagsForStencil(gn, 'mobile streamer', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mse;', w * 0.98, h * 0.54, '', 'MSE', null, null, this.getTagsForStencil(gn, 'mse', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mux;', w * 0.7, h * 0.53, '', 'MUX', null, null, this.getTagsForStencil(gn, 'mux', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mxe;', w * 0.59, h * 0.61, '', 'MXE', null, null, this.getTagsForStencil(gn, 'mxe', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'nac_appliance;', w * 0.86, h * 0.66, '', 'NAC Appliance', null, null, this.getTagsForStencil(gn, 'nac appliance', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'nce;', w * 0.9, h * 0.64, '', 'NCE', null, null, this.getTagsForStencil(gn, 'nce', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'netranger;', w * 0.75, h * 0.51, '', 'NetRanger', null, null, this.getTagsForStencil(gn, 'netranger', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'netsonar;', w * 0.66, h * 0.45, '', 'NetSonar', null, null, this.getTagsForStencil(gn, 'netsonar', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'network_management;', w * 0.59, h * 0.54, '', 'Network Management', null, null, this.getTagsForStencil(gn, 'network management', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'nexus_1000;', w * 0.9, h * 0.64, '', 'Nexus 1000', null, null, this.getTagsForStencil(gn, 'nexus 1000', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'nexus_2000_fabric_extender;', w * 1.01, h * 0.5, '', 'Nexus 2000 Fabric Extender', null, null, this.getTagsForStencil(gn, 'nexus 2000 fabric extender', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'nexus_5000;', w * 1.01, h * 0.5, '', 'Nexus 5000', null, null, this.getTagsForStencil(gn, 'nexus 5000', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'nexus_7000;', w * 0.51, h * 0.69, '', 'Nexus 7000', null, null, this.getTagsForStencil(gn, 'nexus 7000', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'octel;', w * 0.74, h * 0.61, '', 'Octel', null, null, this.getTagsForStencil(gn, 'octel', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ons15500;', w * 0.78, h * 0.72, '', 'ONS15500', null, null, this.getTagsForStencil(gn, 'ons15500', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'optical_amplifier;', w * 0.67, h * 0.51, '', 'Optical Amplifier', null, null, this.getTagsForStencil(gn, 'optical amplifier', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'optical_transport;', w * 0.77, h * 0.77, '', 'Optical Transport', null, null, this.getTagsForStencil(gn, 'optical transport', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pad_1;', w * 0.88, h * 0.7, '', 'PAD', null, null, this.getTagsForStencil(gn, 'pad', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pad_2;', w * 0.85, h * 0.48, '', 'PAD', null, null, this.getTagsForStencil(gn, 'pad', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'page_icon;', w * 0.48, h * 0.69, '', 'Page Icon', null, null, this.getTagsForStencil(gn, 'page icon', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pbx;', w * 0.58, h * 0.58, '', 'PBX', null, null, this.getTagsForStencil(gn, 'pbx', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pc_software;', w * 0.91, h * 0.86, '', 'PC Software', null, null, this.getTagsForStencil(gn, 'pc software', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pc_video;', w * 0.61, h * 0.53, '', 'PC Video', null, null, this.getTagsForStencil(gn, 'pc video', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pda;', w * 0.72, h * 1.01, '', 'PDA', null, null, this.getTagsForStencil(gn, 'pda', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pmc;', w * 1.22, h * 0.77, '', 'PMC', null, null, this.getTagsForStencil(gn, 'pmc', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'protocol_translator;', w * 0.48, h * 0.75, '', 'Protocol Translator', null, null, this.getTagsForStencil(gn, 'protocol translator', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pxf;', w * 0.64, h * 0.82, '', 'PXF', null, null, this.getTagsForStencil(gn, 'pxf', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ratemux;', w * 0.74, h * 0.56, '', 'Ratemux', null, null, this.getTagsForStencil(gn, 'ratemux', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'repeater;', w * 0.64, h * 0.42, '', 'Repeater', null, null, this.getTagsForStencil(gn, 'repeater', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'route_switch_processor;', w * 0.64, h * 0.86, '', 'Route Switch Processor', null, null, this.getTagsForStencil(gn, 'route switch processor', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'rpsrps;', w * 0.78, h * 0.51, '', 'RPS', null, null, this.getTagsForStencil(gn, 'rpsrps', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'services;', w * 0.56, h * 0.54, '', 'Services', null, null, this.getTagsForStencil(gn, 'services', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'service_control;', w * 0.74, h * 0.48, '', 'Service Control', null, null, this.getTagsForStencil(gn, 'service control', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'set_top_box;', w * 1.14, h * 0.42, '', 'Set Top Box', null, null, this.getTagsForStencil(gn, 'set top box', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ssc;', w * 0.91, h * 0.67, '', 'SSC', null, null, this.getTagsForStencil(gn, 'ssc', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ssl_terminator;', w * 0.64, h * 0.59, '', 'SSL Terminator', null, null, this.getTagsForStencil(gn, 'ssl terminator', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'stb;', w * 0.86, h * 0.37, '', 'STB', null, null, this.getTagsForStencil(gn, 'stb', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'stp;', w * 0.58, h * 0.59, '', 'STP', null, null, this.getTagsForStencil(gn, 'stp', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'streamer;', w * 0.93, h * 0.64, '', 'Streamer', null, null, this.getTagsForStencil(gn, 'streamer', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'svx;', w * 0.54, h * 0.56, '', 'SVX', null, null, this.getTagsForStencil(gn, 'svx', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'telecommuter_icon;', w * 0.62, h * 0.53, '', 'Telecommuter Icon', null, null, this.getTagsForStencil(gn, 'telecommuter icon', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'telepresence;', w * 1.38, h * 0.5, '', 'Telepresence', null, null, this.getTagsForStencil(gn, 'telepresence', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'token_2;', w * 0.59, h * 0.61, '', 'Token', null, null, this.getTagsForStencil(gn, 'token', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'tp_mcu;', w * 0.72, h * 0.86, '', 'TP MCU', null, null, this.getTagsForStencil(gn, 'tp mcu', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'transpath;', w * 0.69, h * 0.64, '', 'Transpath', null, null, this.getTagsForStencil(gn, 'transpath', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'truck;', w * 1.38, h * 0.53, '', 'Truck', null, null, this.getTagsForStencil(gn, 'truck', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'turret;', w * 1.65, h * 0.66, '', 'Turret', null, null, this.getTagsForStencil(gn, 'turret', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'tv;', w * 0.53, h * 0.53, '', 'TV', null, null, this.getTagsForStencil(gn, 'tv', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ubr910;', w * 1.01, h * 0.5, '', 'UBR 910', null, null, this.getTagsForStencil(gn, 'ubr910', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'umg_series;', w * 1.01, h * 0.5, '', 'UMG Series', null, null, this.getTagsForStencil(gn, 'umg series', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ups;', w * 0.78, h * 0.51, '', 'UPS', null, null, this.getTagsForStencil(gn, 'ups', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'vault;', w * 0.93, h * 0.64, '', 'Vault', null, null, this.getTagsForStencil(gn, 'vault', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'vip;', w * 0.64, h * 0.86, '', 'VIP', null, null, this.getTagsForStencil(gn, 'vip', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'vpn_concentrator;', w * 0.64, h * 0.59, '', 'VPN Concentrator', null, null, this.getTagsForStencil(gn, 'vpn concentrator virtual private network', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'vss;', w * 0.64, h * 0.86, '', 'VSS', null, null, this.getTagsForStencil(gn, 'vss', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'wae;', w * 0.9, h * 0.64, '', 'WAE', null, null, this.getTagsForStencil(gn, 'wae', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'wism;', w * 0.8, h * 0.96, '', 'WISM', null, null, this.getTagsForStencil(gn, 'wism', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoModemsAndPhonesPalette = function()
	{
		var s = 'sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeColor=#ffffff;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.modems_and_phones.';
		var gn = 'mxgraph.cisco';
		var dt = 'cisco modems and phones ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoModems and Phones', 'Cisco / Modems and Phones', false,
		[
			this.createVertexTemplateEntry(s + 'cable_modem;', w * 0.74, h * 0.35, '', 'Cable Modem', null, null, this.getTagsForStencil(gn, 'cable modem', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cell_phone;', w * 0.34, h * 0.58, '', 'Cell Phone', null, null, this.getTagsForStencil(gn, 'cell phone', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'fax;', w * 1.26, h * 0.59, '', 'Fax', null, null, this.getTagsForStencil(gn, 'fax', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'hootphone;', w * 0.64, h * 0.46, '', 'Hootphone', null, null, this.getTagsForStencil(gn, 'hootphone', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ip_phone;', w * 0.9, h * 0.5, '', 'IP Phone', null, null, this.getTagsForStencil(gn, 'ip internet protocol phone', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mobile_access_ip_phone_2;', w * 0.9, h * 0.8, '', 'Mobile Access IP Phone', null, null, this.getTagsForStencil(gn, 'mobile access ip phone', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'modem;', w * 0.77, h * 0.27, '', 'Modem', null, null, this.getTagsForStencil(gn, 'modem', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'phone-fax;', w * 1.06, h * 0.46, '', 'Phone-Fax', null, null, this.getTagsForStencil(gn, 'phone fax', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'phone;', w * 0.64, h * 0.46, '', 'Phone', null, null, this.getTagsForStencil(gn, 'phone', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'rf_modem;', w * 0.82, h * 0.42, '', 'RF Modem', null, null, this.getTagsForStencil(gn, 'rf_modem', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'softphone;', w * 0.61, h * 0.56, '', 'Softphone', null, null, this.getTagsForStencil(gn, 'softphone', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoPeoplePalette = function()
	{
		var s0 = 'sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.people.'
		var s = 'strokeColor=#ffffff;' + s0;
		var sn = 'strokeColor=none;' + s0;
		var gn = 'mxgraph.cisco';
		var dt = 'cisco people ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoPeople', 'Cisco / People', false,
		[
			this.createVertexTemplateEntry(s + 'androgenous_person;', w * 0.69, h * 0.82, '', 'Androgenous Person', null, null, this.getTagsForStencil(gn, 'androgenous person', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mac_woman;', w * 0.67, h * 1.07, '', 'Mac Woman', null, null, this.getTagsForStencil(gn, 'mac macintosh woman', dt).join(' ')),
			this.createVertexTemplateEntry(sn + 'man_woman;', w * 1.06, h * 1.55, '', 'Man Woman', null, null, this.getTagsForStencil(gn, 'man woman', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pc_man;', w * 1.04, h * 1.49, '', 'PC Man', null, null, this.getTagsForStencil(gn, 'pc_man', dt).join(' ')),
			this.createVertexTemplateEntry(sn + 'running_man;', w * 0.83, h * 0.93, '', 'Running Man', null, null, this.getTagsForStencil(gn, 'running man', dt).join(' ')),
			this.createVertexTemplateEntry(sn + 'sitting_woman;', w * 0.56, h * 0.9, '', 'Sitting Woman', null, null, this.getTagsForStencil(gn, 'sitting woman', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'standing_man_2;', w * 0.22, h * 0.62, '', 'Standing Man', null, null, this.getTagsForStencil(gn, 'standing man', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'standing_woman_2;', w * 0.22, h * 0.62, '', 'Standing Woman', null, null, this.getTagsForStencil(gn, 'standing woman', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoRoutersPalette = function()
	{
		var s = 'strokeColor=#ffffff;sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.routers.';
		var gn = 'mxgraph.cisco';
		var dt = 'cisco router ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoRouters', 'Cisco / Routers', false,
		[
			this.createVertexTemplateEntry(s + '10700;', w * 0.78, h * 0.53, '', '10700', null, null, this.getTagsForStencil(gn, '10700', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'atm_router;', w * 0.78, h * 0.53, '', 'ATM Router', null, null, this.getTagsForStencil(gn, 'atm router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'atm_tag_switch_router;', w * 0.64, h * 0.82, '', 'ATM Tag Switch Router', null, null, this.getTagsForStencil(gn, 'atm tag switch router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'broadcast_router;', w * 0.78, h * 0.78, '', 'Broadcast Router', null, null, this.getTagsForStencil(gn, 'broadcast router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'content_service_router;', w * 0.78, h * 0.53, '', 'Content Service Router', null, null, this.getTagsForStencil(gn, 'content service router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'gigabit_switch_atm_tag_router;', w * 0.78, h * 0.78, '', 'Gigabit Switch ATM Tag Router', null, null, this.getTagsForStencil(gn, 'gigabit switch atm tag router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'iad_router;', w * 0.78, h * 0.53, '', 'IAD Router', null, null, this.getTagsForStencil(gn, 'iad router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ip_telephony_router;', w * 0.78, h * 0.69, '', 'IP Telephony Router', null, null, this.getTagsForStencil(gn, 'ip telephony router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'isci_router;', w * 1.01, h * 0.75, '', 'ISCI Router', null, null, this.getTagsForStencil(gn, 'isci router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mobile_access_router;', w * 0.99, h * 0.58, '', 'Mobile Access Router', null, null, this.getTagsForStencil(gn, 'mobile access router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'nce_router;', w * 0.78, h * 0.53, '', 'NCE Router', null, null, this.getTagsForStencil(gn, 'nce router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'netflow_router;', w * 0.77, h * 0.5, '', 'NetFlow Router', null, null, this.getTagsForStencil(gn, 'netflow router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'optical_services_router;', w * 0.74, h * 0.64, '', 'Optical Services Router', null, null, this.getTagsForStencil(gn, 'optical services router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'router;', w * 0.78, h * 0.53, '', 'Router', null, null, this.getTagsForStencil(gn, 'router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'router_in_building;', w * 0.91, h * 1.38, '', 'Router In Building', null, null, this.getTagsForStencil(gn, 'router in building', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'router_with_silicon_switch;', w * 0.72, h * 0.48, '', 'Router with Silicon Switch', null, null, this.getTagsForStencil(gn, 'router_with_silicon_switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'service_router;', w * 0.78, h * 0.53, '', 'Service Router', null, null, this.getTagsForStencil(gn, 'service router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'space_router;', w * 1.34, h * 0.7, '', 'Space Router', null, null, this.getTagsForStencil(gn, 'space router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'storage_router;', w * 0.69, h * 0.51, '', 'Storage Router', null, null, this.getTagsForStencil(gn, 'storage router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'tdm_router;', w * 0.78, h * 0.53, '', 'TDM Router', null, null, this.getTagsForStencil(gn, 'tdm router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'voice_router;', w * 0.78, h * 0.53, '', 'Voice Router', null, null, this.getTagsForStencil(gn, 'voice router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'wavelength_router;', w * 0.77, h * 0.5, '', 'Wavelength Router', null, null, this.getTagsForStencil(gn, 'wavelength router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'wireless_router;', w * 0.78, h * 0.77, '', 'Wireless Router', null, null, this.getTagsForStencil(gn, 'wireless router', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoSecurityPalette = function()
	{
		var s0 = 'sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.security.'
		var s = 'strokeColor=#ffffff;' + s0;
		var gn = 'mxgraph.cisco';
		var dt = 'cisco security ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoSecurity', 'Cisco / Security', false,
		[
			this.createVertexTemplateEntry(s + 'centri_firewall;', w * 0.43, h * 0.62, '', 'Centri Firewall', null, null, this.getTagsForStencil(gn, 'centri firewall', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cisco_security;', w * 0.78, h * 0.7, '', 'Cisco Security', null, null, this.getTagsForStencil(gn, 'cisco security', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'firewall;', w * 0.29, h * 0.67, '', 'Firewall', null, null, this.getTagsForStencil(gn, 'firewall', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'gatekeeper;', w * 0.85, h * 0.59, '', 'Gatekeeper', null, null, this.getTagsForStencil(gn, 'gatekeeper', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'guard;', w * 0.88, h * 0.54, '', 'Guard', null, null, this.getTagsForStencil(gn, 'guard', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ios_firewall;', w * 0.4, h * 0.66, '', 'iOS Firewall', null, null, this.getTagsForStencil(gn, 'ios firewall', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'lock;', w * 0.53, h * 0.61, '', 'Lock', null, null, this.getTagsForStencil(gn, 'lock', dt).join(' ')),
			this.createVertexTemplateEntry(s0 + 'network_security_2;strokeColor=#000000;', w * 0.45, h * 0.58, '', 'Network Security', null, null, this.getTagsForStencil(gn, 'network security', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pix_firewall;', w * 0.77, h * 0.51, '', 'PIX Firewall', null, null, this.getTagsForStencil(gn, 'pix firewall', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'router_firewall;', w * 0.78, h * 0.62, '', 'Router Firewall', null, null, this.getTagsForStencil(gn, 'router firewall', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoServersPalette = function()
	{
		var s = 'strokeColor=#ffffff;sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.servers.'
		var gn = 'mxgraph.cisco';
		var dt = 'cisco server ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoServers', 'Cisco / Servers', false,
		[
			this.createVertexTemplateEntry(s + 'cisco_unified_presence_server;', w * 0.54, h * 0.67, '', 'Cisco Unified Presence Server', null, null, this.getTagsForStencil(gn, 'cisco unified presence server', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'communications_server;', w * 0.54, h * 0.56, '', 'Communications Server', null, null, this.getTagsForStencil(gn, 'communications server', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'directory_server;', w * 0.72, h * 0.59, '', 'Directory Server', null, null, this.getTagsForStencil(gn, 'directory server', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'fileserver;', w * 0.43, h * 0.62, '', 'Fileserver', null, null, this.getTagsForStencil(gn, 'fileserver', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'file_server;', w * 0.43, h * 0.58, '', 'File Server', null, null, this.getTagsForStencil(gn, 'file server', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'host;', w * 1.04, h * 0.51, '', 'Host', null, null, this.getTagsForStencil(gn, 'host', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'iptv_server;', w * 0.77, h * 0.51, '', 'IPTV Server', null, null, this.getTagsForStencil(gn, 'iptv server', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'microwebserver;', w * 0.77, h * 0.51, '', 'Microwebserver', null, null, this.getTagsForStencil(gn, 'microwebserver', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'moh_server;', w * 0.43, h * 0.62, '', 'MOH Server', null, null, this.getTagsForStencil(gn, 'moh server', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'server_with_router;', w * 0.38, h * 0.64, '', 'Server with Router', null, null, this.getTagsForStencil(gn, 'server with router', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'sip_proxy_server;', w * 0.45, h * 0.7, '', 'SIP Proxy Server', null, null, this.getTagsForStencil(gn, 'sip proxy server', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'software_based_server;', w * 0.67, h * 0.77, '', 'Software Based Server', null, null, this.getTagsForStencil(gn, 'software based server', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'standard_host;', w * 0.43, h * 0.62, '', 'Standard Host', null, null, this.getTagsForStencil(gn, 'standard host', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'storage_server;', w * 0.54, h * 0.83, '', 'Storage Server', null, null, this.getTagsForStencil(gn, 'storage server', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'unity_server;', w * 0.5, h * 0.69, '', 'Unity Server', null, null, this.getTagsForStencil(gn, 'unity server', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'voice_commserver;', w * 0.54, h * 0.56, '', 'Voice Commserver', null, null, this.getTagsForStencil(gn, 'voice commserver', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'www_server;', w * 0.66, h * 0.67, '', 'WWW Server', null, null, this.getTagsForStencil(gn, 'www server', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoStoragePalette = function()
	{
		var s = 'strokeColor=#ffffff;sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.storage.'
		var gn = 'mxgraph.cisco';
		var dt = 'cisco storage ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoStorage', 'Cisco / Storage', false,
		[
			this.createVertexTemplateEntry(s + 'cisco_file_engine;', w * 0.9, h * 0.64, '', 'Cisco File Engine', null, null, this.getTagsForStencil(gn, 'cisco file engine', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'cloud;', w * 1.86, h * 1.06, '', 'Cloud', null, null, this.getTagsForStencil(gn, 'cloud', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'diskette;', w * 0.51, h * 0.5, '', 'Diskette', null, null, this.getTagsForStencil(gn, 'diskette', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'fc_storage;', w * 0.77, h * 0.43, '', 'FC Storage', null, null, this.getTagsForStencil(gn, 'fc storage', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'fibre_channel_disk_subsystem;', w * 0.43, h * 0.62, '', 'Fibre Channel Disk Subsystem', null, null, this.getTagsForStencil(gn, 'fibre channel disk subsystem', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'file_cabinet;', w * 0.51, h * 0.62, '', 'File Cabinet', null, null, this.getTagsForStencil(gn, 'file cabinet', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'relational_database;', w * 0.66, h * 0.53, '', 'Relational Database', null, null, this.getTagsForStencil(gn, 'relational database', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'tape_array;', w * 0.43, h * 0.62, '', 'Tape Array', null, null, this.getTagsForStencil(gn, 'tape array', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'web_cluster;', w * 1.86, h * 1.06, '', 'Web Cluster', null, null, this.getTagsForStencil(gn, 'web cluster', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoSwitchesPalette = function()
	{
		var s = 'strokeColor=#ffffff;sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.switches.'
		var gn = 'mxgraph.cisco';
		var dt = 'cisco switch ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoSwitches', 'Cisco / Switches', false,
		[
			this.createVertexTemplateEntry(s + 'atm_fast_gigabit_etherswitch;', w * 0.64, h * 0.64, '', 'ATM Fast GigaBit EtherSwitch', null, null, this.getTagsForStencil(gn, 'atm fast gigabit etherswitch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'atm_switch;', w * 0.54, h * 0.56, '', 'ATM Switch', null, null, this.getTagsForStencil(gn, 'atm switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'class_4_5_switch;', w * 0.69, h * 0.9, '', 'Class 4/5 Switch', null, null, this.getTagsForStencil(gn, 'class 4 5 switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'content_service_switch_1100;', w * 0.94, h * 0.64, '', 'Content Service Switch 1100', null, null, this.getTagsForStencil(gn, 'content service switch 1100', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'content_switch;', w * 0.64, h * 0.86, '', 'Content Switch', null, null, this.getTagsForStencil(gn, 'content switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'fibre_channel_fabric_switch;', w * 1.01, h * 0.74, '', 'Fibre Channel Fabric Switch', null, null, this.getTagsForStencil(gn, 'fibre channel fabric switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'generic_softswitch;', w * 0.5, h * 0.75, '', 'Generic Softswitch', null, null, this.getTagsForStencil(gn, 'generic softswitch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'intelliswitch_stack;', w * 0.66, h * 0.69, '', 'Intelliswitch Stack', null, null, this.getTagsForStencil(gn, 'intelliswitch stack', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'isdn_switch;', w * 0.58, h * 0.59, '', 'ISDN Switch', null, null, this.getTagsForStencil(gn, 'isdn switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'layer_2_remote_switch;', w * 1.01, h * 0.5, '', 'Layer 2 Remote Switch', null, null, this.getTagsForStencil(gn, 'layer 2 remote switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'layer_3_switch;', w * 0.64, h * 0.64, '', 'Layer 3 Switch', null, null, this.getTagsForStencil(gn, 'layer 3 switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'mgx_8000_multiservice_switch;', w * 0.78, h * 0.78, '', 'MGX 8000 Multiservice Switch', null, null, this.getTagsForStencil(gn, 'mgx 8000 multiservice switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'multi-fabric_server_switch;', w * 0.56, h * 0.75, '', 'Multi-Fabric Server Switch', null, null, this.getTagsForStencil(gn, 'multi fabric server switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'multilayer_remote_switch;', w * 0.64, h * 0.88, '', 'Multilayer Remote Switch', null, null, this.getTagsForStencil(gn, 'multilayer remote switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'multiswitch_device;', w * 1.01, h * 0.64, '', 'MultiSwitch Device', null, null, this.getTagsForStencil(gn, 'multiswitch device', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'pbx_switch;', w * 0.58, h * 0.53, '', 'PBX Switch', null, null, this.getTagsForStencil(gn, 'pbx switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'programmable_switch;', w * 0.54, h * 0.56, '', 'Programmable Switch', null, null, this.getTagsForStencil(gn, 'programmable switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'server_switch;', w * 0.56, h * 0.56, '', 'Server Switch', null, null, this.getTagsForStencil(gn, 'server switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'simultilayer_switch;', w * 0.58, h * 0.58, '', 'SimultiLayer Switch', null, null, this.getTagsForStencil(gn, 'simultilayer switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'softswitch_pgw_mgc;', w * 0.56, h * 0.64, '', 'SoftSwitch PGW MGC', null, null, this.getTagsForStencil(gn, 'softswitch pgw mgc', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'virtual_layer_switch;', w * 0.64, h * 0.86, '', 'Virtual Layer Switch', null, null, this.getTagsForStencil(gn, 'virtual layer switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'voice_atm_switch;', w * 0.54, h * 0.56, '', 'Voice ATM Switch', null, null, this.getTagsForStencil(gn, 'voice atm switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'voice_switch;', w * 1.01, h * 0.5, '', 'Voice Switch', null, null, this.getTagsForStencil(gn, 'voice switch', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'workgroup_switch;', w * 1.01, h * 0.5, '', 'Workgroup Switch', null, null, this.getTagsForStencil(gn, 'workgroup switch', dt).join(' '))
		]);
	};

	Sidebar.prototype.addCiscoWirelessPalette = function()
	{
		var s0 = 'sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=#036897;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.wireless.'
		var s = 'strokeColor=#ffffff;' + s0;
		var gn = 'mxgraph.cisco';
		var dt = 'cisco wireless ';
		var w = 100;
		var h = 100;
		
		this.addPaletteFunctions('ciscoWireless', 'Cisco / Wireless', false,
		[
			this.createVertexTemplateEntry('sketch=0;html=1;pointerEvents=1;dashed=0;fillColor=none;strokeColor=none;strokeWidth=2;verticalLabelPosition=bottom;verticalAlign=top;align=center;outlineConnect=0;shape=mxgraph.cisco.wireless.antenna;', w * 0.88, h * 1.04, '', 'Antenna', null, null, this.getTagsForStencil(gn, 'antenna', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ground_terminal;', w * 0.99, h * 1.22, '', 'Ground Terminal', null, null, this.getTagsForStencil(gn, 'ground terminal', dt).join(' ')),
			this.createVertexTemplateEntry(s0 + 'radio_tower;strokeColor=#036897;', w * 0.37, h * 1.01, '', 'Radio Tower', null, null, this.getTagsForStencil(gn, 'radio tower', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'satellite;', w * 1.34, h * 0.45, '', 'Satellite', null, null, this.getTagsForStencil(gn, 'satellite', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'satellite_dish;', w * 0.99, h * 0.74, '', 'Satellite Dish', null, null, this.getTagsForStencil(gn, 'satellite dish', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'wi-fi_tag;', w * 0.74, h * 0.64, '', 'Wi-Fi Tag', null, null, this.getTagsForStencil(gn, 'wi-fi wifi tag', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'wireless;', w * 0.37, h * 0.67, '', 'Wireless', null, null, this.getTagsForStencil(gn, 'wireless', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'wireless_bridge;', w * 0.75, h * 0.61, '', 'Wireless Bridge', null, null, this.getTagsForStencil(gn, 'wireless bridge', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'wireless_location_appliance;', w * 0.98, h * 0.54, '', 'Wireless Location Appliance', null, null, this.getTagsForStencil(gn, 'wireless location appliance', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'wireless_transport;', w * 0.77, h * 0.54, '', 'Wireless Transport', null, null, this.getTagsForStencil(gn, 'wireless transport', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'wlan_controller;', w * 1.01, h * 0.56, '', 'WLAN Controller', null, null, this.getTagsForStencil(gn, 'wlan controller', dt).join(' '))
		]);
	};

})();
