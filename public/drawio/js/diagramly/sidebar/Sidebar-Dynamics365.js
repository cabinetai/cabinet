/**
 * Copyright (c) 2020-2025, JGraph Holdings Ltd
 * Copyright (c) 2020-2025, draw.io AG
 */
(function()
{
	// Adds Dynamics365 shapes
	Sidebar.prototype.addDynamics365Palette = function()
	{
		var gn = 'dynamics365';
		var r = 400;
		var sb = this;
		var s = 'image;aspect=fixed;html=1;points=[];align=center;fontSize=12;image=img/lib/dynamics365/';
		
		this.setCurrentSearchEntryLibrary('dynamics365', 'dynamics365App');
		this.addDynamics365AppPalette(gn, r, sb, s);
		this.setCurrentSearchEntryLibrary('dynamics365', 'dynamics365Mixed Reality');
		this.addDynamics365MixedRealityPalette(gn, r, sb, s);
		this.setCurrentSearchEntryLibrary('dynamics365', 'dynamics365Product Family');
		this.addDynamics365ProductFamilyPalette(gn, r, sb, s);
		this.setCurrentSearchEntryLibrary('dynamics365', 'dynamics365Sub App');
		this.addDynamics365SubAppPalette(gn, r, sb, s);
		this.setCurrentSearchEntryLibrary();
	};

	Sidebar.prototype.addDynamics365AppPalette = function(gn, r, sb, s)
	{
		var dt = 'app ';
		
		var fns =
		[
			this.createVertexTemplateEntry(s + 'BusinessCentral.svg;',
				r * 0.17, r * 0.17, '', 'Business Central', null, null, this.getTagsForStencil(gn, 'business central', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'Commerce.svg;',
				r * 0.17, r * 0.1488, '', 'Commerce', null, null, this.getTagsForStencil(gn, 'commerce', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ConnectedStore.svg;',
				r * 0.17, r * 0.17, '', 'Connected Store', null, null, this.getTagsForStencil(gn, 'connected store', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'CoreHR.svg;',
				r * 0.17, r * 0.17, '', 'Core HR', null, null, this.getTagsForStencil(gn, 'core hr human resources', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'CustomerInsights.svg;',
				r * 0.17, r * 0.17, '', 'Customer Insights', null, null, this.getTagsForStencil(gn, 'customer insights', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'CustomerService.svg;',
				r * 0.17, r * 0.1488, '', 'Customer Service', null, null, this.getTagsForStencil(gn, 'customer service', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'CustomerServiceInsights.svg;',
				r * 0.17, r * 0.17, '', 'Customer Service Insights', null, null, this.getTagsForStencil(gn, 'customer service insights', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'CustomerVoice.svg;',
				r * 0.17, r * 0.17, '', 'Customer Voice', null, null, this.getTagsForStencil(gn, 'customer voice', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'FieldService.svg;',
				r * 0.17, r * 0.1594, '', 'Field Service', null, null, this.getTagsForStencil(gn, 'field service', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'Finance.svg;',
				r * 0.17, r * 0.168, '', 'Finance', null, null, this.getTagsForStencil(gn, 'finance', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'Finance_Operations.svg;',
				r * 0.1381, r * 0.17, '', 'Finance Operations', null, null, this.getTagsForStencil(gn, 'finance operations', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'FraudProtection.svg;',
				r * 0.1503, r * 0.17, '', 'Fraud Protection', null, null, this.getTagsForStencil(gn, 'fraud protection', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'IntelligentOrderManagement.svg;',
				r * 0.17, r * 0.17, '', 'Intelligent Order Management', null, null, this.getTagsForStencil(gn, 'intelligent order management', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'Marketing.svg;',
				r * 0.17, r * 0.17, '', 'Marketing', null, null, this.getTagsForStencil(gn, 'marketing', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'Product_Insights.svg;',
				r * 0.17, r * 0.1488, '', 'Product Insights', null, null, this.getTagsForStencil(gn, 'product insights', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ProjectServiceAutomation.svg;',
				r * 0.17, r * 0.1587, '', 'Project Service Automation', null, null, this.getTagsForStencil(gn, 'project service automation', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'Sales.svg;',
				r * 0.17, r * 0.17, '', 'Sales', null, null, this.getTagsForStencil(gn, 'sales', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'SupplyChainManagement.svg;',
				r * 0.17, r * 0.1488, '', 'Supply Chain Management', null, null, this.getTagsForStencil(gn, 'supply chain management', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'SustainabilityCalculator.svg;',
				r * 0.17, r * 0.17, '', 'Sustainability Calculator', null, null, this.getTagsForStencil(gn, 'sustainability calculator', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'TalentAttract.svg;',
				r * 0.1381, r * 0.17, '', 'Talent Attract', null, null, this.getTagsForStencil(gn, 'talent attract', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'TalentOnboard.svg;',
				r * 0.17, r * 0.17, '', 'Talent Onboard', null, null, this.getTagsForStencil(gn, 'talent onboard', dt).join(' '))
		];
			
		this.addPalette('dynamics365App', 'Dynamics365 / App', false, mxUtils.bind(this, function(content)
				{
					for (var i = 0; i < fns.length; i++)
					{
						content.appendChild(fns[i](content));
					}
		}));
	};

	Sidebar.prototype.addDynamics365MixedRealityPalette = function(gn, r, sb, s)
	{
		var dt = 'mixed reality ';
		
		var fns =
		[
			this.createVertexTemplateEntry(s + 'ImportTool.svg;',
				r * 0.1503, r * 0.17, '', 'Import Tool', null, null, this.getTagsForStencil(gn, 'import tool', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'Layout.svg;',
				r * 0.1519, r * 0.17, '', 'Layout', null, null, this.getTagsForStencil(gn, 'layout', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'MRPortal.svg;',
				r * 0.17, r * 0.1558, '', 'MR Portal', null, null, this.getTagsForStencil(gn, 'mr portal', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ProductVisualize.svg;',
				r * 0.17, r * 0.17, '', 'Product Visualize', null, null, this.getTagsForStencil(gn, 'product visualize', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'RemoteAssist.svg;',
				r * 0.1503, r * 0.17, '', 'Remote Assist', null, null, this.getTagsForStencil(gn, 'remote assist', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'VoiceAssistant.svg;',
				r * 0.1519, r * 0.17, '', 'Voice Assistant', null, null, this.getTagsForStencil(gn, 'voice assistant', dt).join(' '))
		];
			
		this.addPalette('dynamics365Mixed Reality', 'Dynamics365 / Mixed Reality', false, mxUtils.bind(this, function(content)
				{
					for (var i = 0; i < fns.length; i++)
					{
						content.appendChild(fns[i](content));
					}
		}));
	};

	Sidebar.prototype.addDynamics365ProductFamilyPalette = function(gn, r, sb, s)
	{
		var dt = 'product family ';
		
		var fns =
		[
			this.createVertexTemplateEntry(s + 'Dynamics365.svg;',
				r * 0.1253, r * 0.17, '', 'Dynamics 365', null, null, this.getTagsForStencil(gn, 'dynamics 365', dt).join(' '))
		];
			
		this.addPalette('dynamics365Product Family', 'Dynamics365 / Product Family', false, mxUtils.bind(this, function(content)
				{
					for (var i = 0; i < fns.length; i++)
					{
						content.appendChild(fns[i](content));
					}
		}));
	};

	Sidebar.prototype.addDynamics365SubAppPalette = function(gn, r, sb, s)
	{
		var dt = 'sub app ';
		
		var fns =
		[
			this.createVertexTemplateEntry(s + 'ProjectTimesheet.svg;',
				r * 0.17, r * 0.1629, '', 'Project Timesheet', null, null, this.getTagsForStencil(gn, 'project timesheet', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ReturnToSchool.svg;',
				r * 0.17, r * 0.1665, '', 'Return To School', null, null, this.getTagsForStencil(gn, 'return to school', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'ReturnToWork.svg;',
				r * 0.17, r * 0.1558, '', 'Return To Work', null, null, this.getTagsForStencil(gn, 'return to work', dt).join(' ')),
			this.createVertexTemplateEntry(s + 'SCMWarehousing.svg;',
				r * 0.17, r * 0.17, '', 'SCM Warehousing', null, null, this.getTagsForStencil(gn, 'scm warehousing', dt).join(' '))
		];
			
		this.addPalette('dynamics365Sub App', 'Dynamics365 / Sub App', false, mxUtils.bind(this, function(content)
				{
					for (var i = 0; i < fns.length; i++)
					{
						content.appendChild(fns[i](content));
					}
		}));
	};
})();
