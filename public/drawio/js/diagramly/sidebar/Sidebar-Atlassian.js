/**
 * Copyright (c) 2020-2025, JGraph Holdings Ltd
 * Copyright (c) 2020-2025, draw.io AG
 */
(function()
{
	// Adds Atlassian shapes
	Sidebar.prototype.addAtlassianPalette = function()
	{
		var s = 'html=1;shadow=0;dashed=0;shape=mxgraph.atlassian.';
		var s2 = 'image;html=1;image=img/lib/atlassian/';
		var s3 = mxConstants.STYLE_STROKEWIDTH + '=1;shadow=0;dashed=0;align=center;html=1;' + mxConstants.STYLE_SHAPE + "=mxgraph.mockup.";
		var gn = 'mxgraph.atlassian';
		var dt = 'atlassian ';
		var sb = this;
		this.setCurrentSearchEntryLibrary('atlassian');
		
		var fns = [
			this.addEntry(dt + 'issue ticket bug jira task feature request', function()
	   		{
			   	var bg = new mxCell('Task description', new mxGeometry(0, 0, 200, 50), s + 'issue;issueType=story;issuePriority=blocker;issueStatus=inProgress;verticalAlign=top;align=left;whiteSpace=wrap;overflow=hidden;spacingTop=25;strokeColor=#A8ADB0;fillColor=#EEEEEE;fontSize=12;backgroundOutline=1;sketch=0;');
			   	bg.vertex = true;
			   	var label1 = new mxCell('ID', new mxGeometry(0, 0, 60, 20), 'strokeColor=none;fillColor=none;part=1;resizable=0;align=left;autosize=1;points=[];deletable=0;connectable=0;');
			   	label1.geometry.relative = true;
			   	label1.geometry.offset = new mxPoint(20, 0);
			   	label1.vertex = true;
			   	bg.insert(label1);
		   		return sb.createVertexTemplateFromCells([bg], bg.geometry.width, bg.geometry.height, 'Issue');
			}),
					 
			 this.createVertexTemplateEntry(s2 + 'Atlassian_Logo.svg;',
					 66, 66, '', 'Atlassian', null, null, this.getTagsForStencil(gn, 'atlassian logo', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Bamboo_Logo.svg;',
					 64, 74, '', 'Bamboo', null, null, this.getTagsForStencil(gn, 'bamboo logo', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Bitbucket_Logo.svg;',
					 57, 50, '', 'Bitbucket', null, null, this.getTagsForStencil(gn, 'bitbucket logo atlassian', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Clover_Logo.svg;',
					 71, 71, '', 'Clover', null, null, this.getTagsForStencil(gn, 'clover logo', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Confluence_Logo.svg;',
					 63, 57, '', 'Confluence', null, null, this.getTagsForStencil(gn, 'confluence logo', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Crowd_Logo.svg;',
					 66, 65, '', 'Crowd', null, null, this.getTagsForStencil(gn, 'crowd logo', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Crucible_Logo.svg;',
					 61, 61, '', 'Crucible', null, null, this.getTagsForStencil(gn, 'crucible logo', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Fisheye_Logo.svg;',
					 71, 59, '', 'Fisheye', null, null, this.getTagsForStencil(gn, 'fisheye logo', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Hipchat_Logo.svg;',
					 66, 62, '', 'Hipchat', null, null, this.getTagsForStencil(gn, 'hipchat logo atlassian', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Jira_Logo.svg;',
					 72, 72, '', 'Jira', null, null, this.getTagsForStencil(gn, 'jira logo', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Jira_Core_Logo.svg;',
					 55, 66, '', 'Jira Core', null, null, this.getTagsForStencil(gn, 'jira core logo atlassian', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Jira_Service_Desk_Logo.svg;',
					 59, 76, '', 'Jira Service Desk', null, null, this.getTagsForStencil(gn, 'jira service desk logo atlassian', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Jira_Software_Logo.svg;',
					 74, 76, '', 'Jira Software', null, null, this.getTagsForStencil(gn, 'jira software logo atlassian', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Sourcetree_Logo.svg;',
					 57, 71, '', 'Sourcetree', null, null, this.getTagsForStencil(gn, 'sourcetree logo', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Statuspage_Logo.svg;',
					 75, 52, '', 'Statuspage', null, null, this.getTagsForStencil(gn, 'statuspage logo', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Stride_Logo.svg;',
					 69, 57, '', 'Stride', null, null, this.getTagsForStencil(gn, 'stride logo atlassian', dt).join(' ')),
			 this.createVertexTemplateEntry(s2 + 'Trello_Logo.svg;',
					 70, 70, '', 'Trello', null, null, this.getTagsForStencil(gn, 'trello logo', dt).join(' ')),
			this.createVertexTemplateEntry('shape=ellipse;fillColor=#6554C0;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=46;fontStyle=1;html=1;sketch=0;', 
					96, 96, 'MM', 'Avatar (Large)', null, null, this.getTagsForStencil(gn, 'avatar', dt + 'avatar').join(' ')),
			this.createVertexTemplateEntry('shape=ellipse;fillColor=#0065FF;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=25;fontStyle=1;html=1;sketch=0;', 
					48, 48, 'MM', 'Avatar (Main)', null, null, this.getTagsForStencil(gn, 'avatar', dt + 'avatar').join(' ')),
			this.createVertexTemplateEntry('shape=ellipse;fillColor=#36B37E;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=17;fontStyle=1;html=1;sketch=0;', 
					32, 32, 'MM', 'Avatar (Normal)', null, null, this.getTagsForStencil(gn, 'avatar', dt + 'avatar').join(' ')),
			this.createVertexTemplateEntry('shape=ellipse;fillColor=#FFAB00;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=12;fontStyle=1;html=1;sketch=0;', 
					24, 24, 'MM', 'Avatar (Small)', null, null, this.getTagsForStencil(gn, 'avatar', dt + 'avatar').join(' ')),
			this.createVertexTemplateEntry('shape=ellipse;fillColor=#FF5630;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=10;fontStyle=1;html=1;sketch=0;', 
					16, 16, 'M', 'Avatar (Tiny)', null, null, this.getTagsForStencil(gn, 'avatar', dt + 'avatar').join(' ')),
			this.addEntry(dt + 'avatar available', function()
	   		{
			   	var bg = new mxCell('MM', new mxGeometry(0, 0, 32, 32), 'shape=ellipse;fillColor=#6554C0;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=17;fontStyle=1;html=1;sketch=0;');
			   	bg.vertex = true;
			   	var button1 = new mxCell('', new mxGeometry(1, 1, 10, 10), 'shape=ellipse;fillColor=#36B37E;strokeColor=#ffffff;strokeWidth=2;sketch=0;');
			   	button1.geometry.relative = true;
			   	button1.geometry.offset = new mxPoint(-10, -10);
			   	button1.vertex = true;
			   	bg.insert(button1);
		   		return sb.createVertexTemplateFromCells([bg], bg.geometry.width, bg.geometry.height, 'Avatar (Available)');
			}),
			this.addEntry(dt + 'avatar away', function()
	   		{
			   	var bg = new mxCell('MM', new mxGeometry(0, 0, 32, 32), 'shape=ellipse;fillColor=#FFAB00;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=17;fontStyle=1;html=1;sketch=0;');
			   	bg.vertex = true;
			   	var button1 = new mxCell('', new mxGeometry(1, 1, 10, 10), s + 'away;iconColor=#ffffff;fillColor=#7A869A;strokeColor=#ffffff;strokeWidth=2;sketch=0;');
			   	button1.geometry.relative = true;
			   	button1.geometry.offset = new mxPoint(-10, -10);
			   	button1.vertex = true;
			   	bg.insert(button1);
		   		return sb.createVertexTemplateFromCells([bg], bg.geometry.width, bg.geometry.height, 'Avatar (Away)');
			}),
			this.addEntry(dt + 'avatar do not disturb unavailable', function()
	   		{
			   	var bg = new mxCell('MM', new mxGeometry(0, 0, 32, 32), 'shape=ellipse;fillColor=#0065FF;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=17;fontStyle=1;html=1;sketch=0;');
			   	bg.vertex = true;
			   	var button1 = new mxCell('', new mxGeometry(1, 1, 10, 10), s + 'do_not_disturb;iconColor=#ffffff;fillColor=#FF5630;strokeColor=#ffffff;strokeWidth=2;sketch=0;');
			   	button1.geometry.relative = true;
			   	button1.geometry.offset = new mxPoint(-10, -10);
			   	button1.vertex = true;
			   	bg.insert(button1);
		   		return sb.createVertexTemplateFromCells([bg], bg.geometry.width, bg.geometry.height, 'Avatar (Do not disturb)');
			}),
			this.createVertexTemplateEntry('rounded=1;arcSize=5;fillColor=#0065FF;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=14;fontStyle=1;html=1;sketch=0;', 
					40, 40, '&lt;/&gt;', 'Container Avatar (Large)', null, null, this.getTagsForStencil(gn, 'avatar', dt + 'container avatar large').join(' ')),
			this.createVertexTemplateEntry('rounded=1;arcSize=5;fillColor=#0065FF;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=12;fontStyle=1;html=1;sketch=0;', 
					32, 32, '&lt;/&gt;', 'Container Avatar (Medium)', null, null, this.getTagsForStencil(gn, 'avatar', dt + 'container avatar medium').join(' ')),
			this.createVertexTemplateEntry('rounded=1;arcSize=5;fillColor=#0065FF;strokeColor=none;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=10;fontStyle=1;html=1;sketch=0;', 
					24, 24, '&lt;/&gt;', 'Container Avatar (Small)', null, null, this.getTagsForStencil(gn, 'avatar', dt + 'container avatar small').join(' ')),
			this.createVertexTemplateEntry('shape=ellipse;fillColor=#0065FF;strokeColor=none;html=1;sketch=0;', 
					10, 10, '', 'Dot Badge', null, null, this.getTagsForStencil(gn, '', dt + 'dot badge').join(' ')),
			this.createVertexTemplateEntry('rounded=1;fillColor=#0065FF;strokeColor=none;html=1;fontColor=#ffffff;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=18;fontStyle=1;arcSize=50;sketch=0;', 
					40, 25, '13', 'Bold Badge', null, null, this.getTagsForStencil(gn, '', dt + 'bold badge').join(' ')),
			this.createVertexTemplateEntry('rounded=1;fillColor=#E3FCEF;strokeColor=none;html=1;fontColor=#016745;align=center;verticalAlign=middle;whiteSpace=wrap;fontSize=18;fontStyle=0;arcSize=50;sketch=0;', 
					40, 25, '+1', 'Subtle Badge', null, null, this.getTagsForStencil(gn, '', dt + 'subtle badge').join(' ')),
			this.addEntry(dt + 'banner', function()
	   		{
			   	var bg = new mxCell('', new mxGeometry(0, 0, 625, 50), 'rounded=0;fillColor=#FFAB00;strokeColor=none;html=1');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('<b>More information?</b> See the <u>recovery process documentation</u>.', 
			   			new mxGeometry(0.15, 0.5, 20, 20), 'shape=mxgraph.azure.azure_alert;fillColor=#172B4C;strokeColor=none;fontColor=#172B4C;labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;html=1;spacingLeft=5');
			   	icon1.geometry.relative = true;
			   	icon1.geometry.offset = new mxPoint(0, -10);
			   	icon1.vertex = true;
			   	bg.insert(icon1);
		   		return sb.createVertexTemplateFromCells([bg], bg.geometry.width, bg.geometry.height, 'Banner');
			}),
			this.addEntry(dt + 'banner', function()
	   		{
			   	var bg = new mxCell('', new mxGeometry(0, 0, 625, 50), 'rounded=0;fillColor=#DE350A;strokeColor=none;html=1');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('A database error has occurred. Please reload the page.', 
			   			new mxGeometry(0.15, 0.5, 20, 20), 'shape=mxgraph.azure.azure_alert;fillColor=#ffffff;strokeColor=none;fontColor=#ffffff;labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;html=1;spacingLeft=5');
			   	icon1.geometry.relative = true;
			   	icon1.geometry.offset = new mxPoint(0, -10);
			   	icon1.vertex = true;
			   	bg.insert(icon1);
		   		return sb.createVertexTemplateFromCells([bg], bg.geometry.width, bg.geometry.height, 'Banner');
			}),
			this.createVertexTemplateEntry('fillColor=none;strokeColor=none;html=1;fontColor=#596780;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=12;fontStyle=0', 
					360, 25, 'Atlassian / Atlassian Connect / atlassian-connect-js-extra', 'Breadcrumb', null, null, this.getTagsForStencil(gn, '', dt + 'breadcrumb').join(' ')),
			this.addEntry(dt + 'button primary', function()
	   		{
			   	var bg = new mxCell('Pay now', new mxGeometry(25, 0, 86, 33), 'rounded=1;fillColor=#0057D8;align=center;strokeColor=none;html=1;whiteSpace=wrap;fontColor=#ffffff;fontSize=12;sketch=0;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', new mxGeometry(0, 9, 14, 14), s + 'checkbox;iconColor=#ffffff;fillColor=#008465;strokeColor=none;html=1;sketch=0;');
			   	icon1.vertex = true;
		   		return sb.createVertexTemplateFromCells([bg, icon1], 111, 33, 'Button (Primary)');
			}),
			this.addEntry(dt + 'button standard', function()
	   		{
			   	var bg = new mxCell('Create Group', new mxGeometry(25, 0, 115, 33), 'rounded=1;align=center;fillColor=#F1F2F4;strokeColor=none;html=1;whiteSpace=wrap;fontColor=#596780;fontSize=12;sketch=0;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', new mxGeometry(0, 9, 14, 14), s + 'checkbox;iconColor=#ffffff;fillColor=#008465;strokeColor=none;html=1;sketch=0;');
			   	icon1.vertex = true;
		   		return sb.createVertexTemplateFromCells([bg, icon1], 140, 33, 'Button (Standard)');
			}),
			this.addEntry(dt + 'button link', function()
	   		{
			   	var bg = new mxCell('Visit documentation', new mxGeometry(25, 0, 125, 33), 'fillColor=none;strokeColor=none;html=1;fontColor=#0057D8;align=left;fontSize=12;sketch=0;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', new mxGeometry(0, 9, 14, 14), s + 'checkbox;iconColor=#ffffff;fillColor=#008465;strokeColor=none;html=1;sketch=0;');
			   	icon1.vertex = true;
		   		return sb.createVertexTemplateFromCells([bg, icon1], 150, 33, 'Button (Link)');
			}),
			this.addEntry(dt + 'button primary', function()
	   		{
			   	var bg = new mxCell('Submit', new mxGeometry(25, 0, 80, 33), 'rounded=1;fillColor=#0057D8;align=center;strokeColor=none;html=1;whiteSpace=wrap;fontColor=#ffffff;fontSize=12;sketch=0;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', new mxGeometry(0, 9, 14, 14), s + 'close;iconColor=#ffffff;fillColor=#BA3200;strokeColor=none;html=1;sketch=0;');
			   	icon1.vertex = true;
		   		return sb.createVertexTemplateFromCells([bg, icon1], 105, 33, 'Button (Primary)');
			}),
			this.addEntry(dt + 'button standard', function()
	   		{
			   	var bg = new mxCell('Done', new mxGeometry(25, 0, 55, 33), 'rounded=1;align=center;fillColor=#F1F2F4;strokeColor=none;html=1;whiteSpace=wrap;fontColor=#596780;fontSize=12;sketch=0;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', new mxGeometry(0, 9, 14, 14), s + 'close;iconColor=#ffffff;fillColor=#BA3200;strokeColor=none;html=1;sketch=0;');
			   	icon1.vertex = true;
		   		return sb.createVertexTemplateFromCells([bg, icon1], 80, 33, 'Button (Standard)');
			}),
			this.addEntry(dt + 'button link', function()
	   		{
			   	var bg = new mxCell('Click here', new mxGeometry(25, 0, 75, 33), 'fillColor=none;strokeColor=none;html=1;fontColor=#0057D8;align=left;fontSize=12;sketch=0;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', new mxGeometry(0, 9, 14, 14), s + 'close;iconColor=#ffffff;fillColor=#BA3200;strokeColor=none;html=1;sketch=0;');
			   	icon1.vertex = true;
		   		return sb.createVertexTemplateFromCells([bg, icon1], 100, 33, 'Button (Link)');
			}),
			this.createVertexTemplateEntry('rounded=1;fillColor=#0057D8;strokeColor=none;html=1;whiteSpace=wrap;fontColor=#ffffff;align=center;verticalAlign=middle;fontStyle=0;fontSize=12;sketch=0;', 
					86, 33, 'Primary', 'Button (Primary)', null, null, this.getTagsForStencil(gn, '', dt + 'button primary').join(' ')),
			this.createVertexTemplateEntry('rounded=1;fillColor=#F1F2F4;strokeColor=none;html=1;whiteSpace=wrap;fontColor=#596780;align=center;verticalAlign=middle;fontStyle=0;fontSize=12;sketch=0;', 
					86, 33, 'Standard', 'Button (Standard)', null, null, this.getTagsForStencil(gn, '', dt + 'button standard').join(' ')),
			this.createVertexTemplateEntry('fillColor=none;strokeColor=none;html=1;fontColor=#0057D8;align=center;verticalAlign=middle;fontStyle=0;fontSize=12', 
					86, 33, 'Link button', 'Button (Link)', null, null, this.getTagsForStencil(gn, '', dt + 'button link').join(' ')),
			this.addEntry(dt + 'dropdown button', function()
	   		{
			   	var bg = new mxCell('Dropdown button', new mxGeometry(0, 0, 140, 33), 'rounded=1;fillColor=#F1F2F4;strokeColor=none;html=1;whiteSpace=wrap;fontColor=#596780;align=left;fontSize=12;spacingLeft=10;sketch=0;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', new mxGeometry(1, 0.5, 12, 6), 'shape=triangle;direction=south;fillColor=#596780;strokeColor=none;html=1;sketch=0;');
			   	icon1.geometry.relative = true;
			   	icon1.geometry.offset = new mxPoint(-20, -3);
			   	icon1.vertex = true;
			   	bg.insert(icon1);
		   		return sb.createVertexTemplateFromCells([bg], bg.geometry.width, bg.geometry.height, 'Button (dropdown)');
			}),
			this.addEntry(dt + 'button label only', function()
	   		{
			   	var bg = new mxCell('Label only', new mxGeometry(0, 0, 80, 33), 'rounded=1;align=center;fillColor=#F1F2F4;strokeColor=none;html=1;whiteSpace=wrap;fontColor=#596780;fontSize=12');
			   	bg.vertex = true;
		   		return sb.createVertexTemplateFromCells([bg], 80, 33, 'Button (label only)');
			}),
			this.addEntry(dt + 'button icon and label', function()
	   		{
			   	var bg = new mxCell('Icon and label', new mxGeometry(0, 0, 120, 33), 'rounded=1;align=left;fillColor=#F1F2F4;strokeColor=none;html=1;fontColor=#596780;fontSize=12;spacingLeft=26;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', 
			   			new mxGeometry(0, 0.5, 12, 12), 'shape=mxgraph.mscae.intune.subscription_portal;fillColor=#596780;strokeColor=none;fontColor=#ffffff;labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;html=1;whiteSpace=wrap;spacingLeft=5');
			   	icon1.geometry.relative = true;
			   	icon1.geometry.offset = new mxPoint(10, -6);
			   	icon1.vertex = true;
			   	bg.insert(icon1);
		   		return sb.createVertexTemplateFromCells([bg], 120, 33, 'Button (icon and label)');
			}),
			this.addEntry(dt + 'button icon only', function()
	   		{
			   	var bg = new mxCell('', new mxGeometry(0, 0, 32, 33), 'rounded=1;align=left;fillColor=#F1F2F4;strokeColor=none;html=1;fontColor=#596780;fontSize=12;spacingLeft=26;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', 
			   			new mxGeometry(0, 0.5, 12, 12), 'shape=mxgraph.mscae.intune.subscription_portal;fillColor=#596780;strokeColor=none;fontColor=#ffffff;labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;html=1;spacingLeft=5');
			   	icon1.geometry.relative = true;
			   	icon1.geometry.offset = new mxPoint(10, -6);
			   	icon1.vertex = true;
			   	bg.insert(icon1);
		   		return sb.createVertexTemplateFromCells([bg], 32, 33, 'Button (icon only)');
			}),
			this.addEntry(dt + 'button subtle', function()
	   		{
			   	var bg = new mxCell('Subtle', new mxGeometry(0, 0, 80, 33), 'rounded=1;align=left;fillColor=none;strokeColor=none;html=1;fontColor=#596780;fontSize=12;spacingLeft=26;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', 
			   			new mxGeometry(0, 0.5, 12, 12), 'shape=mxgraph.mscae.intune.subscription_portal;fillColor=#596780;strokeColor=none;fontColor=#ffffff;labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;html=1;spacingLeft=5');
			   	icon1.geometry.relative = true;
			   	icon1.geometry.offset = new mxPoint(10, -6);
			   	icon1.vertex = true;
			   	bg.insert(icon1);
		   		return sb.createVertexTemplateFromCells([bg], 80, 33, 'Button (subtle)');
			}),
			this.addEntry(dt + 'button disabled', function()
	   		{
			   	var bg = new mxCell('Disabled button', new mxGeometry(0, 0, 110, 33), 'rounded=1;align=center;fillColor=#F1F2F4;strokeColor=none;html=1;whiteSpace=wrap;fontColor=#A5ADBA;fontSize=12');
			   	bg.vertex = true;
		   		return sb.createVertexTemplateFromCells([bg], 110, 33, 'Button (disabled)');
			}),
			this.addDataEntry(dt + 'split button', 80, 33, 'Button (split)',
				'7VVNb6MwEP01HBuBHbrdY5OUXFpppRz2bMGArRob2SYf++t3jE1CvtRIvRYJy34zz4PfPCChy3a/NqzjH7oCmdC3hC6N1i7M2v0SpExIKqqErhJCUrwTUtyJZkM07ZgB5R4hkEDYMtlDQDadFC6g1h1kRI3uVQWelCV0UQspl1pqMwRpkRWkmCNundGfMEaUVshecNfKkaeVm/Dy38+/XlLEmRSNQkxC7WLaRvzzpTPit+1YKVTzPkRXmWd0WigH5m2L57QIemzHhYMN5nriDiVFLB4PjIP9XYkGKOqzBt2CMwdM2YnK8ZDxElRMOYiGRxalAWM2rJsj86Q3TqLkt+WnV/JfKW856/zUGcFU49FFJQyUTmgvmdW9f8jLlhyl/aol9hNcyaOCnJW8N7D20q3md2T23SlYK+QBgVdTetVLjJJ0xXpUB8zYQt2boRfcuQ7jOX3FAaXxg0+ws0ZrPBLrhJ2Vuh0CpR1SizqUwOlZkZwsLssEp5D00XaT2+0+Jxzi2zPLw3pihoxcm+E5QAYkc2ILZ1vdMkgs/8fre6r9FN/WsfrThcV0XVtwVwY7HuIhz80f95wU6p7fzn2FjquH68JcQ9LfKB2Z2i37sduU8IW9xm/Nd/1F8+8bCpen/1NIn/6+/gM='),
			this.addDataEntry(dt + 'button grouped', 320, 33, 'Button (grouped)',
				'7VZdT4MwFP01PGqg3eZ83ZT5YmKyB58buECzQkkpg/nrvUBhYxs6oyMmSkLSey73o+fclFp0GZcrxdLoWfogLPpo0aWSUjeruFyCEBaxuW/RB4sQG1+LuANep/baKVOQ6EsCSBOwZSKHBmmATO+EATKt5AZeua8jBByLLrKI+bJAw0bDZ1kEvjGY4GGCaw/Lg0Ig0rHYR6VVyrgMq+3extLb5OmtUuBhqwu15m+V26nyBFyIpRRS1S1Q13GJO6ly1L0ceIL66Txtl+22QGkoB6mpIcPLCmQMWu3wk8IkQS819NkR8DAyYZQ2GMsaO+xC90TjwnB9nnd6wvsi11omiJ0qoGSe+B3HgUx0yxUx9gEj0/vZ3bz7ziQ55jSRCXyJTtQHMiz61PJQKVpEXMM6ZV5VokBR+4JfpAH5VIP5BxIoEEzzLfTSn9PFVHiRHAsTu+ynbiNkEGSgT3Ts+rpI2smwtPRf2rGkdWbX0HY6rO1k9IOz4syUPz4+f/UcfWd4+gHjjNLNVY6J2fAoOWOPkoDgz03ST8/OwJ8fzf1trhmTw8veOw=='),
			
			this.addEntry(dt + 'button compact', function()
	   		{
			   	var bg = new mxCell('Compact', new mxGeometry(0, 0, 86, 33), 'rounded=1;fillColor=#F1F2F4;align=center;strokeColor=none;html=1;whiteSpace=wrap;fontColor=#596780;fontSize=12;sketch=0;');
			   	bg.vertex = true;
			   	var icon1 = new mxCell('', new mxGeometry(107, 13, 6, 6), 'shape=ellipse;fillColor=#596780;strokeColor=none;html=1;sketch=0;');
			   	icon1.vertex = true;
			   	var icon2 = new mxCell('', new mxGeometry(117, 13, 6, 6), 'shape=ellipse;fillColor=#596780;strokeColor=none;html=1;sketch=0;');
			   	icon2.vertex = true;
			   	var icon3 = new mxCell('', new mxGeometry(127, 13, 6, 6), 'shape=ellipse;fillColor=#596780;strokeColor=none;html=1;sketch=0;');
			   	icon3.vertex = true;
		   		return sb.createVertexTemplateFromCells([bg, icon1, icon2, icon3], 133, 33, 'Button (compact)');
			}),
			this.addDataEntry(dt + 'button grouped group', 556, 33, 'Button (grouped)',
				'5Zhdj6IwFIZ/DZdj2iKol4szzm4ym0wyF3NNpEBjoaSto+6v35YWR6Z+MFlQkzUxsQdOP5737Sni+fNi+8zjKv/NEkw9/8nz55wxaX4V2zmm1EOAJJ7/6CEE1NdDixNXYX0VVDHHpeySgEzCR0zX2ESeEiJNUMgdtUHO1mWCdQ70/CgllM4ZZby+6AMQBgs1QBRTkpUqtlSDY3UxEpKzFW5uLVmpuotyWdCmI1bKg47S+mPjb+SPHhwi1d7kROK3Kl7qyEbBUjE7ccwl3p5cfB2yK3/GrMCS79QtG5LI3NwRGD4gxyTLbZbvm1gsTDvbZ36SVD8szONgfQfsnBWFnti32C7gAi3GPbANZuFkCq7A1iYEgck4QD0dCPXYQf1DCE3r/yANx8BBPRkIdeCgdiAbWu92LpqPyOOEbVRDQ0likdcSgGOoD6iqrEp3WWwzXR1HBVuu1tWIc7xUC4p4QxackbKt3GGFac8S9SADgq7j0XggHUJHh1/K7uCVs4xjIW4tyjH3n90ldqZftbR7rbuMagpYqEF/Nrzhv+y74OLpMTujL8c0luQDt7o/Jrod4ZURfTo0fgpBO4OlqcDSMcl+Xp18M3F88874KqXKCX1YhuJUdjOMxhWtpWSls5fvxjdCWYaU2Uu9KDO5vq3UTriOsR5mQzhr2uFksF6QnMRlpqNRQnTlINoFj4Kt9eq/FvO94OeP4S4iTLqIsDMtMHLLOUSuKGE/mtjH9Gb0B38AiWaORC+xrvBXPix0kbj3rT/gkRH2sbO7PidAcHlb3vSpuIc/GsB9/A3CYR67ILyMs3G9yiSVwIMWNCPv6YoWtIoK9B1QRziFPWBy3yrcMyZ0K0zuO4J7xuRfB5Nqfr7+Mqfc4duxvw=='),
			this.addDataEntry(dt + 'button grouped group responsive', 551, 104, 'Button (grouped, responsive)',
				'7Vnfj6IwEP5reLwNbYXFx9PTvZdLLtmHeyZSpdlCSVtXvb/+WiiIVlxcf4B7mmiYKdMO3zedGaqDxsn6hYdZ/ItFmDpo4qAxZ0wWV8l6jCl1oEsiB/1wIHTV14HThlGQj7pZyHEq2xjAwuA9pEtcaAqFkBtqFEJy9ob/kEjGSgEcNBJxGLGVElwlRKGIcWSEkJJFqq5nannMlSKWCd1aZXrKZL3Qj/uUsNnbMnviHM+UqyP+Sv7qYaDnmRNKx4wynruApmAKpwM9R+5LbWSef6qR0svysTCXeN0ITa4yuLxglmDJN+qWlZlEw4MK+NwYk0VszBAqdKEo5EVlugVaXRisD+OOLNy/C6GxuzH6FM/laCklSy0KWCpLGRq5Brw39J+D6j7j7z51KUvxSawpH7BQi/4s4daur2Ii8WsWzvQSK+W90rXiF37Ir3+EXo5pKMk73pn+HM4HjZy7kqmfBFvsc7ZMo4rfflNSC7YLsTO8BDtmhd+MqIWhu94lvrRg87nA0mKz8qsVwZ5F8JgliX7gW+dUjdf/tq13DWphFFwvjL4F14gj/1GUm9iFnmvxC4B/nSL9/CjS19/Nfr+KdND93ruH5H0OtY2J2juyj89N1OXcF03UwxbBYkhWhiQT2E6jFWm7jBiaqnBpg3dwHG/TnmyMiCz8D8DvNwPddkcB955Qgl2hBO4JJdQVSo/zimZOAv92rRF4HGDcoDcCPTvBAPYRxhfrjtR9A+hBf3KjFqmJ4a/TIwH7VOT0wraH/DmFrYjh/nVJbV76+wNTZ22S/U7eZ5g665Ps19hJRPReJ0IojV4D5UmzdtnVYWWLhupTOfmDelBZ7teDz5fro7EwGPg7wYACu11zvQPhcHo8KHH7F2KRs+v/MP4D'),
			
			this.createVertexTemplateEntry('rounded=1;fillColor=#F0F2F5;strokeColor=#D8DCE3;align=left;verticalAlign=middle;fontStyle=0;fontSize=12;labelPosition=right;verticalLabelPosition=middle;spacingLeft=10;html=1;shadow=0;dashed=0', 
					12, 12, 'Text', 'Checkbox (off)', null, null, this.getTagsForStencil(gn, '', dt + 'checkbox on').join(' ')),
			this.addDataEntry(dt + 'checkbox group', 150, 173, 'Checkbox group',
				'7VdRb5swEP41vFYGQsIeWwh9yaRJ/QGTYx9gxdjIdlqyXz8DJs1wOrWLmrVSkSL57nzn+Ps+myOIs6a7V7itv0sKPIjXQZwpKc04aroMOA8ixGgQ50EUIfsLouKFaDhEUYsVCPOahGhMeMR8D6PnATgQA9R6iSxLAD1O0ebA3ZSScZ5JLpU1hRTWe6eNkjuYOUspzAP71WeF4WS7Mr2NOauEHXMojQtPFYIoTr4tVymy/lYyYUCtH+2etI31Pve3QRnoXtz64HL7vgfZgFEHO+WJUVO7GckID6qBVbVLc5AhrEe7OqY+A2kHDsvzuMYermvdKtBaemgquRcUqMPkFFsLQoGKqEg8gG0kT/NsHfuwoeHx0e2xYgTzW+duGKUcZqygGWsWvjuOt8B/SM0Mk32iGpE6FtzM4sfCusWEiWozrJ+Hfe3aNNxtVNeYyie3JsW6HiB4D76nBEfrwTHkzFM1RL4YJt8lYlh4Yshw2+6JRceXw6sgspG2n990VX913GDDsdYMixtSA9ltZfcz8sWEULLK07+d1s+io+tIJEmuJpHEk0jBsenXrpmBL5F8XJGk17tHlp5INlJU1rPlmOy+Xiwf48USoutdGytPEbeUvk0Ibzrv5fCcaIBAj+i/qmDxv5ibqFr4h3d5piOM48upSs80AYLYjv+S7vpcu/zJqXEJq9mhej+mrPn8vTXE/vgc+w0='),
			this.addDataEntry(dt + 'dropdown button', 100, 53, 'Button (dropdown)',
				'tZTLbsIwEEW/xksqxwbabnmETStVYtG1RSaJVceO7AmPfn1tYqCQIPpcRLLv3JvJnJFC+LTaLqyoy2eTgSJ8TvjUGoPtqdpOQSnCqMwInxHGqH8IS69Uk32V1sKCxq8EWBtYC9VAqyxRYONa2eFORdmaRmcQUgnhk1wqNTXKWH/XRnvPxKE1b3AhllipQ8RoPFQJ46PH8f0D9bpQstBeU5BjtC3le+iahJirxUrq4mlfnSW0x1IbqRHsfO1ndl4MnjgWWITtVTR7KXJZgKkA7c5bNjLDMjpoi4+WIIsyxiJSKlx7L47RE2h/iKz7ufMO91dj33JlNt8g7zGmScrS4f/gZ/34/xr37pzqLfqc/57+sEO/Q92Vog5HtFLoIqiTTFpYoTQBlzNN+MrLdRyx3lrHjyHyfojngYiU3o26TFkX6biVLCiBcg1nr+rDHNu/hBlOvQeHDcbug4tFmTx3gJ01HYfo25y/nv6Frf3zr/ID'),
			this.addDataEntry(dt + 'dropdown button open', 110, 200, 'Button (dropdown, open)',
				'7ZdJj9sgFIB/jY9TYYizHJvF6aGVqs5hztR+jtEQYwHZ+usLMdmMnWUymVMiRTLv8UL4Pj1sB2Q0X08lLfNfIgUekElARlIIXV3N1yPgPMCIpQEZBxgj8w1w3JINt1lUUgmFvqYAVwVLyhdQRV411QtVhZXecBeWYlGkYKvCgAwzxvlIcCHNuBCFmTNUWop3qAVzPee7ElHoXTbAJBp0e31k4pSzWWFiHDLtpr2yf3bV0JapkiasmP3cZschaphSClZokJOl2bMyQTvHbQukhnUrmm3IcZmCmIOWGzNlxVKduxmowodyYLPclTmkiKpqPNuXHkCbC8e6mTvxuL8J+Z5xsbqBvMGII9KP+rfjz7af8/hxM/7Pxr05pXqJPiH30+949D3qKqelvdSS0WJmo8OUSUg0ExaXEgv7L+s69lgv6WiCeMQeXw2VNEM9LXCI0bfIZ4x9xN0qJIFTzZZw8lNN2N3yv+2eDmu/7Iy61V9q4kSWKdCetv0mrjIZXTZ5tn9ahJnMOJ6Ek8hmcpqatqzKjxRSmThbHZugSb6QMKWlC7QZjumccYvkB/AlaJbQj6o/309R13cdNvRT2Onc31BdT8OIC2Wgt8tAvoy4E0dxr6179h5QzcPNJ1jtLNyfoRKUKXxzwO66tUSXby1NMnaH20dbb3Oi41M7recp/gNLBqubJJ97Vnj6vdovGTxAcN8T/P0vLVIj52n4yw338AMMDzzDVzx0PgU/RHCIovsNm+HhVbGafvwm+R8='),
			this.addDataEntry(dt + 'dropdown avatar', 160, 167, 'Button (avatar)',
				'7ZjRcqIwFIafhss6QAT0ckXtTXfGme7MXqdyhMwG4iSh1T79JhKoAiJWu9NudQYHTs4h8p0/P4iFwnRzz/E6+ckioBaaWSjkjMliL92EQKnl2iSy0NRyXVttljs/MursRu015pDJPgVuUfCMaQ5FJEwYE6BiWG0RCBJnwIssIbfUZHGWZxHokzgWmqwIpSGjjKvjjGUqZyIkZ3+gFkxkSssSlsly1HKRN/aDka3imKoJVYzCSpq0R/KqZ3V0mVjjJcnih93o1LEbKcXlAJewOYpkFzI87oGlIPlWpbyQSCYmw2CzEyBxYsrKGBbFcVyVvgFWO4ZxO2/U4H0GWsXJ9dDIG/XgewmI7eH17nPxWrggdDmX4WkuIsFrvSs5wVmso5OIcFhKwrRgBMv1r6wDW+0+J4H1oYXaaR0WGHb2wGvCc5vs/CLEgWJJnuHgVG08zfQLRtSvqua+K1tlZr+rdYStVgJkox/VRfRqkddo0QKTWDvFr5y3eUTZsHQTa38bECaCAVmyTAxyofL79mpf9scdpCrucBC33UEofgK6YIIYKfGiPxOtB7LE9KE2npIo2umvTPhhpqwGLtFTh4LKZXLgSsOrSMipKagU61Ul5F/ofscFMp3PnJmnRxIcsRdTvqcWzJdGBcNezem2Rs9vrm6/xRodp6MRfb0xOIea3aQ2H869eXDMAitgdg3Y2cuotiCrNcvVQ8Qr/Dao+nmtf/oW3ca7vBW9dzFsD3R6Ve2PPrd9Vilfxj6Db2ef40uMoOu5/OYBTQ9A4w/oYCmTvRY+4lQF1HcOVNxM4EwTGH87E6j+495c4B+4QPAhLWx564IF6MsKE5w+Ab8ZwblG4HQ/sP8HTqAO394LFun7rw3/Ag=='),
			this.addDataEntry(dt + 'flag message', 333, 90, 'Flag message',
				'vVbfT+owFP5r+qgpLfPKI8Ppy72JuRp9LtvZ1ti1S1th+NfbrgWHg0iCCgF6frWn3/dxANFF091p1tb/VAEC0QzRhVbKhlXTLUAIRDAvEL1BhGD3QuT2SHTSR3HLNEh7SgEJBSsmXiF4gsPYjYgOrV5lAT5/gmhaciEWSijdB2nZP5zfWK1eYBC5uc0mWeIjNSvUOpbXthFxyXT+wN/8IVNntYpLCzpbucaN82F/lpI2phBvx15BW+iO3rd3xcvegWrA6o1LWfPC1iGDUhrKauBVHctmASfMTLCrXekHem4RATwMJh2B+fA4//94cZ34w9zOBC8BpPvINTDrMP2M9QCeHWz+5gUzdU8BDpHW5zdd5XVzyaxgxnAmL/Ma8pel6sY80auU/slGPEklYZ+VAeaT6daODfrDBVuCuFeGW66k8+kAYcoEr7wtoPSmaVnOZfW3twJ7hxg+iVHyJaOu0xGhW58GwSxfwd72h1iOJ9z7Nl1K7IckoWKzb243UGVpwI5EsmvzJN1MR7p54rD2CcY4j/8KY5QRdI3RnARzXjjxYKvcm4TO92ta3Tf+K4qKujlXTN4eiBTj6SzFYzH9oHLIFR5LJ87Mc6Wz3TpKJ8E/IJ3k6/l9pgK6Q8M97Z+7yHMElHznID9C3n7B7wyBCzr79ingzI+f+ZA+/BfwDg=='),
			this.addDataEntry(dt + 'multiple flag message', 333, 150, 'Multiple flag message',
				'vVZbb9owGP011p6GHBvQ+jgoVJO6qVIf9jiZ5AuxcOzINhD66+cbNBBQkQoNIvJ38+V8JydBdFq3T5o11W9VgEB0huhUK2XjqG6nIAQimBeIPiJCsPsjMr8QzUIUN0yDtNcUkFiwYWIN0RMdxu5Ecmi1lgX4/AzRScmFmCqhdAjSMlzOb6xWK+hEHuezbDbykYoVapvKK1uLNGQ6f+VvfpGhsxrFpQU927iNG+fDfi0lbUoh3k57BW2hvXje4EqHfQJVg9U7l7Llha1iBqU0llXAl9W+bBSBwsxEx/JQ+w6fGyQEz6NJe2j+4aX1y+dK5tyAG1luHbKnIDuQGj+s26XnwoC9rTXE+z8m3In70M/nozHFPeilknAMdAfGbLi309K+XrAFiBdluOVKOp+OqEyY4EtvCyi9aRqWc7l8DlZsyLmmXdUk8mGT3E77PUo+DYJZvoGj6c/1La3w4rfpUtJ+yChW7I7N/QSqLA3YXtsP27yKCcMeE37Zb8Z5FmD8VnjpqVB1CIG5D3PpeeFwApl7Z84CaZgsQn7IKcDkmjehW84Jrd1Xm3UDOsxSKl1HjPbFbAvGnWDQo16XVok8n2WUtztMxeHqM2pbcQuvjla+but4f19KuY30OTXGN+HUfprEqVMxuQmnRh9rdadHB9n1CBbMVEHCcYwca40VzBjO5KA9J+ST8DtE/iZAyS1F+0Lzjgu+Rh2+04f7y8O418pnLlf+aVbuVisN6SlG/v2N0YygHxj9JNHs5rI86sBtiZBXkK8Wqj1569xLHoYPkzPy8NVSQO4iBVlGPk8gZ75/E8b07ifjfw=='),
			this.addDataEntry(dt + 'multiple flag message', 333, 120, 'Flag message',
				'vVVNj9owEP01ORYZG6h6DQvbQyuttIeqR5NMYgtjp7aB0F9fT2wgNKBFWnaDiDyfHr95nmRsvmmfLW/ET1OCytgiY3NrjI+rTTsHpTJKZJmxp4xSEv4ZXd6wjjsrabgF7e8JoDFgx9UWoiYqnD+opLBmq0tA/3HG8koqNTfK2M7Iqu4JeuetWUPP8rRcjBdTtAhemn0KF36j0pLb4lX+xU0mQWqM1B7sYhcKd0FHcC+jfXKhKKdawXpob563U6XDPoPZgLeH4LKXpRfRgzEWwwTIWhzDElCEu6ioT7Fn+MIiIXgdTTZA87fZYk4L4a0DCpQURmsofAD0f6B72Jwww2OX3IkOfxItDfpv2hpJM+Jececk16NCQLFemXbYJDbL2dfFoEnaaLhsSQ/w8eQopwJxc8VXoF6Mk14aHXQ24pdzJWuUFVQouoYXUtc/Oim27lp772onfbOdodJhN5POguJe7uAi/bUOpx1esMzgkuqh0xhxuBSPCUxVOfADgpzKvIszkxucEXyHpFkBaNyyxCtIiTf4Emipw8VsMqTt7M8W50W+lLo8mb9zucY8Rncq6ZBs0sPo7D9gYJ83iR3vpQzKPSqS7hlSZi9Caa+BNxi3D8z+WM6EQoakmZGHkOaYJpFmSj6ANNO3x/Y7p0l7babn3e9k+ZUApY+c3zeadxnwOdf/C/v28PsfxPPXPbr3P/7/AA=='),
			this.addDataEntry(dt + 'inline dialog', 292, 228, 'Inline dialog',
				'7VdLj9sgEP4tPVg9NcI4zmaPu3lsD1t1pVXVY0XsSYyCwQXy6q8vGOw4a7sbadftpZYSMzMwDN98DDiIZvnxQZIi+yJSYEG0CKKZFEK7Vn6cAWMBRjQNonmAMTK/AC97rGFpRQWRwPU1A7AbsCdsB07jFEqfmFdIseMp2P5hEN2vKWMzwYQsjdG6fIxeaSm20LDMl4twEVtLRlJx8MMznTPfJDJ5pr/sJGMjFYJyDXKxN4Ero0N2LsG174Kt7GMFqeHYu95S5Rf7ACIHLU+my4GmOvNrvvWLzIBusmrYrQMKEeUUm3rsGT7T8Ah2oxm10PymwCh0Zv8/02KWEW3nKIoWzE1gueDQwtQrGwg28AnHlew9lggzuuGmzWCteyC+ClL8OqRj1IbUUw9JYETTPVz474LZT/Fk4zRdfEA4diNOXnzhQKzXCnQrS3WcVyVu3Ercd7FjqZ1V7OwSiEmhNA1RADcvRvlW2fG8O7uMJmbJgpddlAZiXYm182f9rKQ4KOMxWg5NhGojNbYmKp82QQ4Z1fBckMSOO5ia9A9IMxmENDEagDRxizRfHTv6WNGV7UYW60JpMU6Jysqii5ylsP3z48aeFCOiGVGKEj5KMki2K3H8gdu1GaH4Zj7to8+VnLBZNmRmd16d0zRl0MOxioM2GEZWwJ6EouU+iObS5bh2+PjCXjtWhoCUbx7L+echGpaEYddZgN+FgxG64GCIhyDhpEXCueAfbRQZ2Z/Pnop9JoQJ0z5dRkxqBkx+7uyl494TJ502VZONfT/YaBHVHyonJjjnx9n/l7K/cP6FMR6ARjdvvAeOcYwni778XlS2zitgWTKGvgNWgI7xJaK3HuFGQuOOfEbR22+I09dxflnsc5UQGIFFppBUwchkW5sCqa6+jfssvBu8N3+EF40uCVvLzf0y3Hb5FF6W3Vp+y34x4vmbzHVvfrL9Bg=='),
			this.addDataEntry(dt + 'inline dialog', 340, 450, 'Inline dialog',
				'7VnbbuIwEP2aPBblyuURAnQfqFSJavdxZYghVh0b2YbCfv2OE3N1aEGQh0hBAmU8thOfc2Y8OE4QZ9tXgVbpG08wdYKRE8SCc1VcZdsYU+r4LkmcYOj4vgtfxx9f8Xq5110hgZm6ZYBfDNggusampRjgSrWjpknwNUuwHuE5wWBBKI055SJ3BsPRyBu1oV0qwT/x3sM4w7oxRQn/AtsFI1UZNZMgMZ+Sf3r+SHsWnClje752U7JkYMxhGRimG2ywUGSOaN84MpIk8HjFw4MPb68CkDeZ1b9inmEldtDliyQqLXqEZskpJstUncOAZGEvDyOPaMKFAbQc3MACd6qQUPrmSM1TwpZwqVIi9Rgp1/gO5Pf4VgA6xQt1HXKYfoXm8OyTvNvQcx9hYXvOwAkpvlsRK6HFyn2CX+QfC3sdCmMIheiUAO8aAZ7Bf4wyQnfQ8BuLBDF0QUto7JObuPnHpusRFnZGrzYLQVlshM+gIbJo6CfJPjSwkBYpt6r/BO9TKA+2mdGC8Bb8wh9zybfJRGCKFNngs/nLQDS3eOeEqWOU7DHbnZv7CfhiIbGyODg85020tO+NjqOme7ekKFBwGPf64/E5U0WnPwZH/1lk9ErICKIqyIjcCsjo/EwGpJqVvsy2S11EtAiXnRaZcyZblPNPyNN/lxRJeSM3fhh0ot7j3LS/TffeGXRuK7LyjhfZxHnPIe5ln+bM7V86rSoCqWtx947IErZ492MtGBQ1dzC5lnkRdPNG5EdBN+raubCsy8U2clkUWJt9MKBohuk7l0QRrkeKgqJDwTC58B8Kh6sVxdNyb0nqDauIds+tItx7lmSmKIMG+F1jau+IjWJqpJjAr0Axh+L7KJkJ1mUkiEbhDWaNaGotmnZYhWg8SzQxklivMk5RNisrvhvV1Eg1vXYVqrGPiiZE5pmGZCsJYDaaqa9mDvXqczVjn4B9oCzTq3ybDzlDNGlUU2fVtKsogz37hK6fa6b541R/xfQqKYPtw8RYEKn4KtV6cQdrxoCLpqyps3QCv5Ji2D7w/AB5aNVMMwKrbCRTY8lElVTC9rFsTFiiV/mLz2ZNlqm1ZLpPKITBPL7CL7qfvuH/Dw=='),
			this.addDataEntry(dt + 'inline edit', 130, 222, 'Inline edit', 
				'7VnbcqIwGH4aLsuEREQvWw/di3amM73Ya0aCZBcJE2LVffpNSFAwsKU1dOyOzOjkzwnzHf5AdNBss39kYZ480winDlo4aMYo5aq02c9wmjoQkMhBcwdCID4OXHa0emUryEOGM95nAFQD3sJ0i1XNCyOUEX5QDQU/pLohJmk6oyllIsxoJmofCs7ob3xWmfCNWMbcE8WYZvyV/JETeMdYzwhEHKZknYlyimOum6vJHIj86TiYyG45JRnHbPEmFlXoofp3Y8bxvnPtZZVe+COmG8yZWBfYkYgnugdS+IAEk3Wih2nMQFioeH0cekJSFDSY7cAiA9gf4gYGqIxuswhHGq+QrTRcUwlHDXABB/TRxJ/0QF21/9SLhLImD1ckWz+VMM8RMLGOy8ukpA36GqvwUioOGnFfjXiPGeRfzszIYMZgpUjCXBY3+7V0phsyRncFdEU9y+9lIFGNDp5ExJ2UwV4GIxeoQHzPfXequqGyGxyXLTIIXBSIIKN8lWhQW0k9U8ByCcQlZyEMrzihWdmVScjsMYX+yRRwW6hqYcrTMDOchpy84cbt2ujTd3yRyxBd9s2p9d3vguYENI4LzA32jz+7lyD8/oIoOM4FjruEcPwqTCXrdkIiTQOeTN3JrOlRg2t5iXqhwIjgk1kradRS68j0MwBaKmd+riunoNtSOYWaBrhj/5Jk26Gb5oAPqiiwIqK7yvOVitAAKhq/r6KuZI9M+o/5uKke0TJfLryFb0ioTPxJGNGdDr4ocwegX+b2fHh56g4MjJ/DXwKYc6DPRN+y/TUteu690dJfBp3WrVAGTde3PMxUBoWmQY+7OcPSf3UaP+3A8ecedxC6zGWHhgGsmmpyjak5jnVuHS41V5u6pdQcWNnS7STjr9jRpzfZ/K+ysaqTatL6hoIjst2Ycml5g+r5PnzbL9r3CzQdglGvv/VT0kJa+eh9/wBAq6XtPVQBK96q6iznZH8IZsyjpidhi5vRBjdaAIeg0zzg6jTalR2jwPkDCGYdL8P2HA7tOPz7nKN45snaM8ksv57dEsDHE4AHBknoV3ludjT3tzk3U7a5ssfsQfNEj6Oym3C+qXAuUYoIT/98qu71P0b/Ag=='),
			this.addDataEntry(dt + 'inline edit', 230, 60, 'Inline edit',
				'zVbBbuIwEP2aHBsZmxA4llB66UqVetizlTjEqokj20DYr99x7AAhYZuKIm0kkGfsGWfee+M4IMm2flW0Kn7JjImAvAQkUVIaN9rWCRMiwIhnAVkFGCP4BXh9Y3bSzKKKKlaaMQHYBeyp2DHneVdcKm6ObkKbo/ATORcikUIqMEtZgnepjZKf7MpZmC2UsZrAMJel+eB/bILJyfYZEdhU8E0JY8Fy46fbZAEm0WIWz+2ySvLSMPWyh6K0D/XvzZRh9c3aG5cv/JXJLTMK6kIHnpnCr4gdPqhgfFP4MI8ZotrZm1PoGUkYeDCHgSU9YN/koYepkrsyY5mHi6rUo7WwaFzgDWjkzdMDHWamyeJ5ve4i7xb99oVi66loysvNWwP1iqA+3qh5+rQMwX/BLL6XjqNHPXIRX7FDovvZmfbY6VGjC1rZ4bbe2O4MqVLyoHEIflU9W8Oimh0nFpFw3hi1NaYhcgb8r6Jw4ZaRZhmeNTPWiEMSg1FKkxYe1MF2upIBXi1RnNgsXLHUcGmJ0nJnIfs5psg/mULhAFUDTE08zIoJaviedbYbos/v+G7LgCV1N7Xf/SnuJpB5rpnpsX967VGCiMYLQhtWAY6Hghv2AU1lfQeQSLcBz519k9l+j15xPcURnsHrLkGBGWfnZm2lcXG8Tsf385BytEuDwll0z4F7QzfdgG+qKP4RET21Pd+qiDxARbOvVXR5Rhc0g2+CgzejujjL5frsMYJqzWkZpgVLPwc/Aq1W+qp69PndBiy6fUrmo+id33+axw+Hvf4/IT/dVFrI43Hn8vfvN2CeL6WuMy7vrH8B'),				
			this.addDataEntry(dt + 'inline message', 460, 180, 'Inline message',
				'7VhtT+MwDP41/Tr1hW7jI3tDd4LTCXTiI8pab82RNiVJt8GvPyfNum7pEAiG0IlJmxLbceLHj51oXjTON5eClNk1T4F50dSLxoJzVY/yzRgY80Kfpl408cLQx68Xzo5oA6P1SyKgUK9ZENYLVoRVUEsukgSkRBmDFWhTUpaMJkRRXsjaWqonZq0XlLExZ1zgtOAFSkdSCf4AB8IFL9QtfdargmA7t270nDC6LHDMYKGseuvBC6P4vD8Y+igvOS0UiOkKw5Oo0zIbAQgFm6MoGJGF4BJ4Dko8oclTrY1qkPw1TVVmF8RWlgFdZtaLBdMnsp4vG087iHFgUe5GPHIQ//nj5sIBNlM5s9jIjKR8baNNicwgtRPUlNo+3yw1g3pEMSIlJUUvySB5mPPNfajRbCUJ0fT9eDAZvpSpPWP9cTOk8UZWsAsrzmmaMjjIrH+QeX0YRubAfnNJNaFQKGp4G4dXB/rGsSxJQovlldl/EpyCDtsFNs2WHf0OdoQuObay95DjzCHHmBcLnBQJfFPk61JkGH8aRWKHIiOSzzn/psfXpUcQfF4L6bv8oGpeJQ+gtOck4ZUO9f+8yIOooxBPdZMPHKR/wRoFlQQhzRmM+Rw00joA3A6/Ah4rkHqmsGj9v4hE70PSEXbUzsvpaErzVOnouDob6D86HUMnHQ6qTrd7rgTUv/eEYaRuq5vNhiMD0WtaXTAIR2fj97So1/bIdnPf62rxkWy2iBJ+UJNrns0vZftEyT7vSHafacjmOFjqwXXFFC0Z7HW92ga9N2ae7phR4O8P72BXwKRSPCcmD0yHT4sVVcZtoafFXtGbmm51XIzET6GEIsUc4RjTjYDxSuyOZdqDUqiXve7TbM+tk4jWScO4/mPF6yDMnZwO26I6vj9lSsxp7aZ2qxYUtdctGj7XVu/ZUQBJcU3OBRzd5aAwBeKQmkeJuUNEYqkauQW5MB+nIFEzmU2Dadxo7iwL9x5AHVdUq5TWGSb2FutJ773GFuGUl6kdK7qxlA67Hiknelg0xdOusbOOIgvit78lcLr758Ho9v6Y+Ac='),		

			this.addEntry(dt + 'inline message subtitle', function()
	   		{
			   	var icon1 = new mxCell('i', new mxGeometry(0, 0, 20, 20), 'shape=ellipse;fillColor=#403294;strokeColor=none;fontSize=14;fontStyle=1;align=center;fontColor=#ffffff;sketch=0;');
			   	icon1.vertex = true;
			   	var item1 = new mxCell('<font color="#0057d8">Log in</font> to learn about Confluence', new mxGeometry(0, 30, 230, 33), 'rounded=1;arcSize=3;fillColor=#ffffff;strokeColor=#DFE1E5;strokeWidth=1;shadow=1;align=left;html=1;whiteSpace=wrap;spacingLeft=20;spacingRight=20;fontSize=12;');
			   	item1.vertex = true;
			   	var item2 = new mxCell('Want more information?', new mxGeometry(30, 0, 200, 20), 'fillColor=none;strokeColor=none;align=left;html=1;whiteSpace=wrap;fontSize=11;fontColor=#596780');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([icon1, item1, item2], 230, 63, 'Inline message with subtitle');
			}),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;strokeColor=#DFE1E6;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#42526E',
				 70, 20, 'DEFAULT', 'Lozenge (state, subtle)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;fillColor=#DFE1E6;strokeColor=#DFE1E6;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#42526E',
				 70, 20, 'DEFAULT', 'Lozenge (state, bold)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;strokeColor=#008364;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#008364',
				 70, 20, 'SUCCESS', 'Lozenge (success, subtle)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;fillColor=#008364;strokeColor=#008364;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#ffffff',
				 70, 20, 'SUCCESS', 'Lozenge (success, bold)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;strokeColor=#BA3200;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#BA3200',
				 70, 20, 'REMOVED', 'Lozenge (problem, subtle)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;fillColor=#BA3200;strokeColor=#BA3200;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#ffffff',
				 70, 20, 'REMOVED', 'Lozenge (problem, bold)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;strokeColor=#0057D8;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#0057D8',
				 100, 20, 'IN PROGRESS', 'Lozenge (current, subtle)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;fillColor=#0057D8;strokeColor=#0057D8;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#ffffff',
				 100, 20, 'IN PROGRESS', 'Lozenge (current, bold)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;strokeColor=#6554C0;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#6554C0',
				 50, 20, 'NEW', 'Lozenge (new, subtle)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;fillColor=#6554C0;strokeColor=#6554C0;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#ffffff',
				 50, 20, 'NEW', 'Lozenge (new, bold)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;strokeColor=#FFAB00;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#42526E',
				 60, 20, 'MOVED', 'Lozenge (moved, subtle)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;rounded=1;fillColor=#FFAB00;strokeColor=#FFAB00;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#42526E',
				 60, 20, 'MOVED', 'Lozenge (moved, bold)', null, null, this.getTagsForStencil(gn, 'lozenge', dt).join(' ')),
			this.addEntry(dt + 'inline message subtitle', function()
	   		{
			   	var item1 = new mxCell('Yeah, progress!', new mxGeometry(0, 0, 120, 20), 'dashed=0;html=1;rounded=1;fillColor=#172B4D;strokeColor=#172B4D;fontSize=12;align=center;fontStyle=0;strokeWidth=2;fontColor=#ffffff');
			   	item1.vertex = true;
			   	var item2 = new mxCell('IN PROGRESS', new mxGeometry(10, 30, 100, 20), 'dashed=0;html=1;rounded=1;strokeColor=#0057D8;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#0057D8');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 120, 50, 'Lozenge (tooltip)');
			}),
			this.addEntry(dt + 'inline message subtitle', function()
	   		{
			   	var item1 = new mxCell('SUCCESS', new mxGeometry(25, 0, 70, 20), 'dashed=0;html=1;rounded=1;strokeColor=#008364;fontSize=12;align=center;fontStyle=1;strokeWidth=2;fontColor=#008364');
			   	item1.vertex = true;
			   	var item2 = new mxCell("Don't stop believin'", new mxGeometry(0, 30, 120, 20), 'dashed=0;html=1;rounded=1;fillColor=#172B4D;strokeColor=#172B4D;fontSize=12;align=center;fontStyle=0;strokeWidth=2;fontColor=#ffffff');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 120, 50, 'Lozenge (tooltip)');
			}),
			this.addDataEntry(dt + 'modal dialog', 330, 210, 'Modal dialog',
				'1VZtb9MwEP41EZ82Oc7ajY9b200gISGGhPjoJZfGzM0F20lafj13iZO1JIMJBBKV6vjenjv7uYsSJavd/s6qqniHGZgo2UTJyiL6frfbr8CYSAqdRck6klLQP5K3z1jjzioqZaH0LwmQfUCjTA29JpJLQ6E3D7TZ8mZQ5EiQUjh/ML3r8muNg+HM6W+kvSaH+KLaPxkHlM9YWzJmyhUPqGw2oFJpPfBpMlJPCsh0M+M2oz1VRTKJxWwFQjtafAG05to630m63NLzgDUfFtjWFlCOKoNs1uU5rR+70LdvPvC57zH3LV38XA6jH6FH4BJSZV+5YzfGuql9h+s8KI7DnPMX2I71cKirANiqSl7zGphMAw0/VxzvQxTj612F1quyB87R7pTXyEdRD9ilC6gt2kd6nE0qrSx+gdS7HjwoVep1o70GNxYSLNq5Gtz5c+zIk/aRhd9Rv69jslmsywyyIOXamBUatJ1fknc/0jtv8RGOLOvbTbxZhBa87zpwHUuSldHbkgQD+dChR2Gi+zFgoTJsQ1Zl0wGCpLbQHu4rlbKipflkdxKZjWQtOboB63WqzHVI5pGdKtSlB7tpaAIdacV4dPaH/bOD2qnClN4B7sDbA3OjM1/0HknSD7MoQG+LECbjoFSuV2zH2Ke5p00Y/fnXQDJ5DVxn2YQw7teOJD7TS9kTYnG5vpqwV2IJPyEuBb7EwSGUIEaUT+FS5JTcsVt+mwj5SyIWMzwk4Q4tGJqyBk7g57gJGd5zmeQS6pEiYB8CwOIHejHPHfgJuWOhL+L7YsL3SpUpv0T+mPJA7D9ie/F6eXkl/l+2l3+BbRKfPiB69+Pvi+8='),
			this.addDataEntry(dt + 'detailed modal dialog', 330, 210, 'Modal dialog (detailed)',
				'1Zdfb5swEMA/DY+JwBRIH7v86TZt0rROmvY0uWCCF8Mx2yTpPv3OYNIQ6JouSbVFCth3vvPZP98Bjj/Nt7eSltlHSJhw/LnjTyWAblr5dsqEcIjLE8efOYS4+HfI4gmtV2vdkkpW6GMMSGOwpqJijcQhoUDTN/fYWJpGK0gBXRJX6QfRDA1/VtAqRor/QukNDvCuyu2jsvXyDSqJyoSq7B6oTFqvGFrjuDsZinsBJHw9MGxA2hU5xPfcwQhcrvCiM4bXlEul6x4vlnh/gMoslhndJmPFTiTAqHkxxuuX2vT9u89m3XeQ6g1u/NAcgq9Y48GEEFO8hjQvMSpagsKb2rcyrt9Uup5GaUaNG0hNOBlsduEZT6pkzGhpYa5pxQxbwdbmPjX22loZ/zwvQWpaNI5TkDnVHMzK6D3U01mvG5ArvI16gZcSfrBYq8a5FdJY8zXXnKldIFbDlaqYGj8Fi3ROE8l0jsd/5qFOQlUkLLG9lAsxBQGyHuen9c/smZawYnua2WLuzQN7Iu/qAznziNlkwZcFdgRL2wO7Z+bWP+Mwowls7KxUxq0L7G0yrtldSWMj2GC6muHYNTT8GTHWayY1j6m4sZNpKG1yoYJtn0zQWmSz85ZBzrR8MBB4orNmhO83SexmjC8za0Y8K6SqESx3to/5jg2b8sPp7/fS/yZJemTMwaxpmGUei8l1g2g26WEqoGB/IBTjtjDZDrAhuDsvX+2mkD5FeyyO2XEyvONdg4dOb49GMADDtxspmcCcWrOO7RAgO/sn4HU62qlHXkvazj4KDyBDmiqme4h3qziK+lWP+pQWsakZJ4O3eF+JeXAdRhP3P2cevQbyoIf8Ay9W/xrwXmGuS8jZ8D4D1L4qnZ7EB0TbfDsr0HDgxe0cZXsRLSaL66Gn69ydk3nUeTJGF2HjuZessKQLxwsvACd6Hg6+a5SmmW+X5uV/zEFFYx5DocYCYIXvFd+Xgip1TLohHHLlR8F1l/Nh+TyGVfiCMumOgz470kfXyk5F1+bRrlBegNykR+5tEwRumn7Fcun9Rbk8/Wn4ouffmcrlQT6OgjM8/rD7+AndDN//wv4N'),
			this.addDataEntry(dt + 'small modal dialog', 410, 410, 'Modal dialog (small)',
				'7Zldb9owFIZ/TbSrVnYChF62EHrTqtU6qZeTmxyIVSfObPO1Xz87MTTg0LItmdgYUgT+OnH8vD7HOXjBKFvdClKk9zwB5gWRF4wE56r6la1GwJjnI5p4wdjzfaQvz58caMVlKyqIgFwdM8CvBiwIm0NVc50kuoLo60WQPE6NORAZlZLyvOot1ZrZ3qnK9JzH2AtuBJ/nCSS2NKWMjTjjouwXTMuPrpdK8FeotYwnEY76ZgTP1RP9bgzrSQc3hNFZrgsMpso214ah8mMMpiThS3tXImJrwpSWKVXwVJDYVCz1Gpvuukjz2eYmCxCKxoRd25spXmymYh/SGCo4zRWIaKFXVeo6M9IunB4Pq4OLX1bZlb8FnoESa91lSROVVj16uAKEUqCzVO1VEllVzLZj31jqHxZnM9rAQXuzAZqTDByUCZFpic883VFcc56Dg9RW1mhi3EyzvsKVjWe7Lr7Lu381CIfod1j4H7LAqIGF3UBIACOKLmDHfhMfe4tHM0/dZbVrZl0VB3uA+XQqQTl4t/M8injPIQ6zS13xoLnP2gCuOUzCyXBy1bSRIxT5UbizCUMXvN1/d2VpjNFPkt53Ei2RD8IG8kHQBflhF+T7DvknYBCbWagU6r58zefm0Uk5Q8XLx9MoadmXxDFIaRtOxT2gM3QPGAcdqGTgqORZ6AhZA38qzM8xJOB+F54hdJh/WRcG+Sevpy99tzypvERefVHR3gHhf7xoQRZhF7IYHg4YcwnCxIBlaqJDTIwultZPlAFDpVTWQ8qSqpTPy/hRFIJrmyfkSc4xevioi+hx5UjmQbsLUc7+21wfIk6I+jnGD7/XhaPYvInWsH8G4w7MS7R+LCoVt++lB/IC2xd0s6w7itAthemfrWYmAXJJFCNSUpJfxinEry989dV3IwpC/XA8fE8kTWmCPbHsv/dnNEkYNPiOuujMZBh5AfbIpV4AbgaKCuvW4N1e+9ZwQyDrUne+K7tNXcuy6yQ+YezIbpu9SHSkUk3JqPcPImjiT/qNGajheBQFf5l2jtpg/4TAAjToQmBu5vMeRFtZko99VF0XG33FYGj9ygFmm15tm/jugPVOqaaGQXfH4Qvc29XDRSe5M+ymS0fa3wD7g4eadrTQ2bHmSC30O9RC2IEUdPHt/5aqe/3vmB8='),
			this.addDataEntry(dt + 'medium modal dialog', 616, 420, 'Modal dialog (medium)',
				'7Vpdb6M4FP01PM6IjwDpYycJnZW6q5G60j6uXDDBOwazxiTp/vq9NoYSDGmngpF2k0ht4Prrcs/x8cWO5W3y0wNHZfYrSzC1vJ3lbThjornKTxtMqeXaJLG8reW6NvxZbjRR6qhSu0QcF+I9DdymwQHRGjeWxlCJF6oNmcjBra1jeV84q4sEJ/ouJZRuGGVc1fNS9QF7JTj7jnsl22jn7HzZghXiifwjOwa/vC+Ikn0BNxSnQhf3mtnqIzvMUMKOelTEY92FvDtmROCnEsXScIQwyupwS4p9O8gBc0FiRO/1YIKVrSv6IWVHJSOFwHx3gMBVYJMtdWygPT5NxleZdHAfMMux4C9Q5UgSkTU1AidommWY7DPdbKWBsVHVGPZd21e44EIjNo6eN4JeQNtQnsEY/F2ztuBTpQJ4DxWcsDy9FsLVXn4/YSEgglXbG/jRdNgUt+aEHHomQMyxe6XQ6LzCsM0DLjBHdLL+sMOR3t4cYxCPuGPX6yMDz/wwWZtRuC9LjDgqgFuX4/ARzz/i0I+6MefYvzFBUphGgrDiLV4MHZkWlL6EFKzAhnpoY084HHdcOPqTuenjDz0F3YG0dLoyrgwfVgL3TSVwHNtUAi/QRo4phPeAzwYYkwc9xjfpKFTRHrWC8nJ+23bA0rTCwlCXztF3Cc7q7eUCxLqUl5Qo5BLCcSxJA6aK1TIS5gKxs2GBCAzgpnR5uIzMhc4YON484DjeOTrBEuj4BjqdxP70KTg64RacWiBcJnruTOCFPwG8wADvKYOkx7X/Amcg53IjFWl4GMZy+MpxVaE9rgxsLyZpkR25kT+apK23m513IQsbAD4Uz5wkCcUDJtgjxKHoGdNvrCJaFXiDV9fh46C861jndY9q/K1aYHs87pJEaU9QlakQLMw6xzVJ19pmJt3dEqQLDdJtSVVSJB9TkBzLqgX8c1efMlZzuEoZz5G4JCjTQLRLQ37ayxeez0hQVFUEFZ/jDMffn9npT9ekrMxItutLsvRfYev/g4jOIpnF2mDiV5I0/FOZBASE4wPBRxA8+1k+fYJTVNMbFa+Ziv4SVLybouKepDf23djXsW+9BPvat5Ae/X6vucoAbQiN9Afn8DIeq/dwkEfB5Fd+ywWvJxfsSDIv8xyDeb/IaN9IdR2kWi1CKvOEwfENSp2F870HDlEYraO7if0kdxda/cOC0CTYOdy+yUz/LgjXUwAvtAnl+ybgnjcL4MYOobcI4OahRE6KWoysTj+y9bSkYPQIl6E4qzl+kAdJ29UF6COUEyoD+RXTA5bjzrkRudxelrsekiBYggTmRvGuQM9yMbGrsqmrUt3b4nIdi0u3PTsvzcwd7w3j8sCh5Zk8B4ZBa8FypPChLzfKXQnlllnezH36R6Y4liQKANRom9wjtRMk0I1u10E3N5yBbnD7+tufpnr/p0H/Ag=='),
			this.addDataEntry(dt + 'error modal dialog', 470, 190, 'Modal dialog (error)',
				'vVZLj9owEP4tPUR72lUeBJbjLrCrHlpV2kpVjyaZELeOJ3IcHv31HTsGEhJWaBEbCeMZz8v+vnHiRbNi+6pYmX/DFIQXLbxophB1Myu2MxDCC32eetHcC0Offl74cmY1sKt+yRRIfYlD2Dismaih0fzGmhQUwIxLrDX9a6SBqgNttDo34x9c0nj3HTYaN/LugYSvGQ07618qTABSmm24zq0Tr0zERHOUNHlmxRLRrtuCSlAFk1S12LVzMbuYoMz4qlbMOVegNZcrCjgjSeDKhpYmnYKqFtrIGapjXqr2odlqpXfCbTXXBR34PPCiZ4W1TCF1UkY1zVBQAGMXZfYhfaUV/oXWyvxlESxi44FSv/F/JnAQkswEX0kSBGTaLbfcfPuYgDlLceOyMpXsQ5C0ybmGt5IlRrEhghhzEmnfpAiN9xqU5gkTTy6ZxpbRTyPMI2NXIpca1GJNx1uR0ugc7hQBtme5Y1WOOK+ABWi1s5ClhKm1GE0afvk58FW+d5s6Jasaxerge6QiTRwbh5kZ9Zg5d6Q4QTFlVW6RM9u6FNL5Ior9px6kEiW8g2YC5hz3Bq4E/xDllzuXsI/4gUIfxiIcxqLrsOtILZzGAzBF7ogVCGqsNXR8h6Bz2X+YLRxT3wcjv5P9fnwCP2YZdWwP/MMuLuLDqMeHGZMJ3ZjX88Gh/klUiKfjyeNVbXkdFeIbUmHyGUyIe0z40iMBXaylmaoci2Vd9eAfxvrMHXGul0+5cbjN/SGiHK/36AbgtwAOBwDe664EOOziG94C3vHZi5+qL7HiGt2b5JKu/0ifPw6/wPddHrzzQr8lrNPbNW7cxTWIrseVxONnbGPe/sr9Dw=='),
			this.addDataEntry(dt + 'warning modal dialog', 470, 220, 'Modal dialog (warning)',
				'vVdZb6MwEP41PDbiCCF9bK6+tFKlrrSPKweG4K3ByHau/vodg5NwVtlcSCDPeMY2833MDJY3TXevguTJO4+AWd7c8qaCc1WO0t0UGLNcm0aWN7Nc18bbchc9s04xa+dEQKbOcXBLhw1hayg173xDsxXqCN5/+RKfS1BbgAxHUpEVSBykZK8nBJAvbSoUjUmocBhBDlkEWUhBDlD+BAbFBDm463EWFU+9hgC5ZqrcMuRZzGio9A5bWhx0qe0jKnNG9qC9EhAwKE8t1Z6ZUycqxdjNHMubCL7GA0RGinGZKWdcFHZeXFyol0rwL6jMzBZzZ+5rD56pT/qtF3ZclAmjqwwFBrEy0xU3u7j0ggmJ+NbsSkR4WAKlbUIVfOYk1IotYq3NUdQv7c1c7b0BDGFI2IvZTPGK0S8tzDxtl3OaKRDzDeIrUal1BkJcAXa9NChUhgOvwFNQYl9EOVJJaTEMSqpghOkqMW4H/thElorV0ffEKhwYYnWTzOsiGbQwjIhMCtz0S50L6GLxMinjXwM04xn8gGUIOooHA3OE0yq/TVTcNt5HAl2MhNuNRN1hX5MqKI06QPJMgAUwougGar5dwJndP/QrnLZ+coZ2bfenUQN8HscSVAv641ucxYZhiw1TkoWY+q7ng0H9QVTwn0fB+KqP8joq+HekQvAIJvg9eaEsOw02YH7N9TDdrXS1HJDvNRaC4vmHMIzzJbmhYuwE7mQ4bRBl3OCFJhwjS2AfXFJFuSaQKKN/TOFvjfmURpF2bhaSZso/2lWobgrAW+Ex8+/AtQqf3K78b9+ET26dTs2ichM2jVpsOvYepu84M79cklGc7kahyptHZY8qos/3SxENSMf+HSANWpB+CL7CjlEem0gUALutpIVuvUqcGrLndp6YT+ezhdMHc/VzbJWE+gfq2D80iA16dMHerFE3+7AfRgPHce/Ag3GLB73lQSrIe1ruzhaitzx0lP86a+wXZz70UI/1KKJwAr0jPQzP50VEBSatsnRIvta7T2S5jD0YXVUCgv9oN+yB32o4nA4aBbfpNw5d4aHf8K5nEYqn/+jSvPqb/Q8='),
			this.addDataEntry(dt + 'multi select', 270, 390, 'Multi-select',
				'vVjbbuIwEP2aPBY5CQnlEUKokBZaqd1dad9cYhKrJmYdc2m/fsfYQMilhNsiIeLJjMc+Z2Y8xnKD+eZJ4EUy5hFhlhtabiA4l/ppvgkIY5aDaGS5A8txEHwtZ1jz1t6+RQssSCqbGDjaYIXZkmjJK2FkKmkag1jSOYGfL56STCtm8pMZxUTOYbkD23L7M8pYwBkXME5BGUSZFPyDFIQznspX+qUmsJUdZjROYcDITJrXOwvLcb2u33lEIF8nVJLXBZ4qwzVgBTKzbiIk2dTufSsyG38ifE6k+ASVNY1kYjQ8jQ9KCI0TY2YwQzjT43hvekASHgyY1cC6JWBLAAq+TCMSGQyxmBpougVEAYrZ9lOCFd60g25vCGvq5+jQSr/NLh0lAfCA0h9bnAcuKoONtp8iJ1eA/Gmw9LRFDnOnU4G5616Pefs05lmCF+oxk2RRE1k5IA8MobqQLmNdoA717LDtgjwWOKLkAHouJ4Z4TpkC7BcREU5xIVXaTely+xEVKnu5EmV8qRbVz/Q0qOV7TRPHreb02MAwjFpliu0KhjtaJAjDkq7I0VRVrBv3L5zCqva+H3YsG+8Phbjhs1lGZClq9ptoFEheKZB6DGcf+JoUDoNwMLTrwuiM7D0jGo7r7RXEf0N1VTLvCuiVXHvHTNvoDlT7p2tGnpsER3xt6kGEs+RQHExhmW9idZi3sISIyShOW5uqsu09+n5nWMF2E5K8K7Ozc7fktP9DcnYqGPOZCvd3eIjltsZpgYp/UJ3ucff/LrlW2HUXOZG2fekFo+EIVoHeRuMQfv48T8LdhLA2PeexHxCXfEd0lROBQxtVvw0gaWdcpBTnpmtsPSErHF1k+SxIDOfEBZa1NkXF35AhULhkMze38HjTUBg//5y89UaTq2OhybKLuz9p0xMUGvN66m/hY1uxoOTd1ckowsl9PYyBJ3wxVGe7m5B3oduFO+7pROJXSusPtuNGpvHtYzAM7dArdBpOdSNS1a/sz9Pj9kmNqlpz0wiZtkidknSKWc/4knyxW4nZI7KKzZOTE70p/YHduCn+/qLjo4YXne4NbpeP59wuUZnRAwEnmlGuoJJqi9voFERdJnbdSrOWslMNW9ML4aUtiaGlXbC4pAWB4eEfGa2e/8PmHw=='),
			this.addDataEntry(dt + 'multi select avatar', 340, 320, 'Multi-select with avatars',
				'7VpZc9owGPw1fgwjXxyPYI62Q9pMSabPii2wWmFRSwTor6+EZQOWcZwap1MKMxw6Le3utzoGw/aW20kMV+E9DRAx7JFhezGlPPm13HqIEMMCODDsoWFZQLwNa3ym1NyXghWMUcSrNLCSBi+QrFGS02cMLyKEkgLGd0QVhHwphjc0DXswx4R4lNBYpCMaiQoDxmP6A+Uy5zTiM/xLdmDKdpCIrkWCoDlXxWkLw7LdXrvTBSJ/E2KOZivoy4YbgY3IU+NEMUfbs3PdZ6mJThBdIh7vRJUNDnioargJHiBEeBGqZgojAFmSXmRND8iJHwq8YiBtDUgNwJiuowAFCkMY+wqaXg5RAcV8/9JgFSWO1+uPxZgGR3Qklb6pWVoyR4CHo8V0j/PQBjrYYP/Kc1ID5J3C0k1aHGFuOwWY23Z9zB0N83sY72AU6eI9h70LdPBH3mg4Ns9p+g24C1FUxD0fKlV4sEt5AC2diJ57XvsxIpDjF3TyuCJy1BMfKBYDsYAan+pZPfzOzEUUnc8Z4hq32bAr0e2+HmLH5IQwoBuRkGAHkIV79kFSspL1l9uF9N0W5AQK04NRa1sUcW633e6MC+iuQpJTTNJpgxLKOjpjnYsQdmc6p5TZDTDWfp2xPBmYsk4L+zRirTVDcZXFRnBkuXbX7Z5GZy7wMkstCTw9hE0pGAKfEXmgDHNMZcs4IWMgucc+JNNc+RIHgZxfVqGvHpkV1NFOiVqsksXtT/XSaEh3NIFMMYMi5wOW9W4m/q4mboL3sPHuP2jjnf/axns3G69h42e0c002nnZa/fRT+bwzHI/MkXtsBKfeX81my88sbaBRUHhmySrWObRkC8MBq9nTZDKaPX788nmmwVb1qH0UMTFiApvU4ArO3bkFDmgrl0qrURREoTqqV4IeFGN/rPdOyQGxpuCb0bt+bVKi94LdSbaBeI1LKqniu9TC8tReiIDSE3pNAhyzCQL065ZPa8ZxJPI8yMT5X0yoTdKFQST9DPz2z7W8XRscyfiQ1V7I7+/Ml5044LCn8Oky7VEMLuk0qfyOa+Fblz337616VcLeKbBY5yLbonS1TDXoNqFB/fqpP52KjKfZ6OvNyC/tI91GONTvlGZQBDoQn2tEWE0fYUx1c3OSK3ES0+w2IUP9omyKYCQvQmYcvaCorhAJU93chHgtQnQb2VfpF3JyOyVn6YVw+Yziukr0/bSfmxSvRYpdpwkp6veEDxAv5Nb+cR1Hgul6QlzxpJebDK9Ehpl51ZGhSB7+fJFUP/5vxm8='),
			this.addDataEntry(dt + 'error message', 340, 150, 'Error message',
				'tVbbjtsgEP0aPybCYOfymJvTSq1U7a7UZ2SPY1RsLCC3fn3BJhcHJxvtbi1ZgmEGmHPmAAFZlIe1pHXxU2TAA7IKyEIKodtWeVgA5wFGLAvIMsAYmT/AyZ3RsBlFNZVQ6WcCcBuwo3wLreW7UqbZWJU+cmctdGn2tgwDMs8Z5wvBhTT9SlTGYa60FH/gxpiLSr+yv3aC0MZRzjaV6XDItRs+RQSYxNPReIKMfV8wDa81TW3g3gBjbLVglQa52pmslDFbP7dxkBoOd5NvTC7zNYgStDwalz3LdOE84hYgVADbFC7MgYaoavubc+gFStNwaPYjS3xkXwYT4iErxbbKIHPgUpk6zKY3UBuM8ubz8DYj0WI6S8zG5lc8tU6/XarYWgyqrNr8aAhYxj4JqPl8rr4a/6ODOW4jruggUQ8dhHyejsij41GNq4JmYu8yzagqGoJQO1Jb//KwsaIdUs2pUoxWw5QLBT5p0/EMzZJ7IiloWmwlrG2ZL6M7UFuWEloybnH7BnwHmqW0KzH8NCekn5NugGMIDX2Kwshn6GSTwKlmO+jM1UebW/+Xzfay+ABPOssPxt0ZRJ4r0B7t5yyeqoTYq4S3AmwlgDTImUZmPDGqhG4SUrWosndU+7ROl8kqXMXXBdYVfXhzbuIHB+VJoynYgulq35aAKRE+cz5a1Bf9v9lOI///pOsRek7X0y84Zkcemy/nKa4J89Dqv7O6RCZhghOrykeH9IdBjN+9nPruptNh+Empne89x1l0w8VHpGa6l5dL6379sPkH'),				
			this.addDataEntry(dt + 'progress tracker', 470, 30, 'Progress tracker',
				'zZZRb4IwEMc/De8FBPVRmfq0J7Mse2zklGaVI6WK7tPvCmXikOgDzJGQ9P7HHdcfpVfHj/anleJZ8ooxSMdfOH6kEHU12p8ikNLxmIgd/8XxPEa34y07vG7pZRlXkOpHArwq4MjlASqlEnJ9llbYCikjlKhK02csDJaUbp5rhZ9Qe1JMwYgJj7Egm5Gh8JDGYN7kksXVZi2+TNLAODMUqQa1OFKluQ2wxYDScOqcUCnZ2awA96DVmR6xAXa+rBCxTiqJSq60BMQuqbNYjeeVvfvJdKFFAwvsNjy/Be8d5IbytBgmei8thibOGtotkltMteXllvik2KVkSNhq6258lWAajicGYZEIDeuMb0xgQetqANTna4QN1OEN0l4PpEct0pECrsGkNaTL+f45dFZeHdB7WMtuja4b+HQg4EEL+Fsmkcem/gQ1PgO23XcGgu1N7sIeDwQ7bMH+wIMiJQbNhcz/2XbSA+wRexrs8f2OR00sM0MKFFkOvygTnlkwe5nPHuqBA7W5Uf2HNoi5/bQ5Mi/nj9J3dTz5Bg=='),
			this.addDataEntry(dt + 'radio button group', 150, 173, 'Radio button group',
				'7VbNbqMwEH4a7gZCkh5baHrpSlV76NmLJ8FaYyPb3YY+/Q4wpA2mq2rTrVqpSEieGWbA30/iKM3r/ZXlTfXDCFBRehmluTXGD6t6n4NSUcKkiNIiShKGd5RsXqnGfZU13IL2b2lIhobfXD3AkLkBW0vnpNFuqDnfKqptpVK5UcZiqI3G7IXz1vyCSXJrtL+TT11XHI8xjeliruRO41rB1lN5nBAlaXa2XK0Z5unbwHrYv7q/PkWbuwJTg7ctPvIoha/oiWzAgFUgdxW1ES6MuyHeHVqf0cIFATYPXhqAdwtcYMZo1QbguYo33RJnyMZ1MFnzoAUIAuUluIjChm2STRYgjJViXeSXaYgb668Q3g5AWXJ1TulaCqFgQgub0IaYXij+E9SNcdKjGjBpB/gOA68n9cNg1/BS6t11//4i7mZXvla0UQRCmEd6p+Cu6iE4lfCxgXhtiSIKX8ohCdUw5k5RwyJQw72VHt6ggwnz2/6aY56xbFWsD5V72tTii2nhPWiOj2jOliHNM6aP38H02YzpkQ5ZepTxt+c/gefXH+f5ZSCGcxGq4K+cTzw9808699Mw0l0iRGD/lfDFR5DUjo7NAlqWMx5N09NpWQW05FyXeLo65UAzd0L5QjRQw+rYK/+RFQyfz7F97eiY+wc='),
			this.addDataEntry(dt + 'single select', 340, 320, 'Single select',
				'1VjbcpswEP0aZtqHeATYTvxIfKszTtopafusGhnUCESFfEm/viskMBjboXYy03gmE7TalXbPWeEjW+4w3k4FTqN7HhBmuWPLHQrOpX6Kt0PCmOUgGljuyHIcBH+WMzkya+ezKMWCJLJNgKMD1pitiLb4qaAQm5sz+cyMOZIxJDeyLfd2SRkbcsYFjBOegMNtJgV/InvGJU+kT/+oBWwVhxkNExgwspRmuoiwHLc36F/fILBvIiqJn+KFCtwAMmAzWRIhyfZopbnJlDklPCZSPIPLhgYyMh49jQaKCA0jE2YQQjjT47AM3eEGDwa6wzC6DRgh1waGgq+SgAQGRiwWBp3BHqiAxjL/NJCFme5w4E0grdsKI9rphynUURbAjybhPId61GvCjfJPk5VLkH42gPZ0RAV4t3sAeNe9HPhuA/hTnZtFOOAbGKjCA5xFORlIz6TKP96G6ix2sGQ4yyhOOgvGM9IkaHDtIW9yrPVboegeRrEeYDBFnSaodreJaWEThGFJ16S21iGgzf5feH7oi82vnJva9lfX9RX4cpkR2SCqrKIVd70D3PWZasKf8BDqbtQG1bzguijx7/9ece1QvDgqJh3rf5tOx/7j7PODXywDGemV6quDubFjQNcVE2xjo6Oz9Zy/q5PfXFjSkEMJdzS21Bvn/Lo+TFZyJYhq8vxV/fHl6t6qmDkPeQb/7UtL8hZ5s55d0mnK9gtuE/56fejN5xDif/k6e3g8pxP/sdh2MZNVRnlSoa0l476KeFWu1QtBJaIzemXmz6T7NAbDmQKiSL77Rng80OQXNl8itNPpvANg7mb3ChnvjRAZYUae3kODFK9F538H4oTjvvW4qKqr2tY6djQZ2+NCmBbXBCVdT18TSt1aarm6llajQzcII4iNPM4P1QIzz+wleVpkYmpE1r6IdiqmR+U/snslNBcJ5j5qJ5hLx0sUc/9lxbxjFDUZ3RFwSPhW+oIrqKQqMT9sgmTAUHFHUQ4RXkQgZKaKn1EXDKkSoUSM14BbVuwOnExwTJla6BNha6KIq7eNg9ry0HvxinjypnKuqi54HlyuomG4+3VAu1d/PPgL'),
			this.addDataEntry(dt + 'avatar single select', 340, 470, 'Avatar single select',
				'7Zpdc6IwFIZ/DZd1AgHFS7/q7I7tOmt39nInhQjZBuKS0Nb99ZtIsGqopYvcODjTlnydJO95chJSLThJXucZ2sR3LMTUgjMLTjLGRPGUvE4wpZYDSGjBqeU4QP5Yzu07pfauFGxQhlNRp4FTNHhGNMdFzohzEqUYFwVcbKkuiEUihze1LTheE0onjLJMplOWygpjLjL2hE8y1ywVK/JXGbBVO0SlaZmgeC10cdnCcqA37A98IPNfYiLwaoMC1fBFaiPz9DhxJvDru3PdZemJzjFLsMi2ssoLCUWsa3iFHiDGJIp1M60RQLxIR/umb8rJBy1etZDQENIQMGN5GuJQa4iyQEszPFFUSrHefQxZZYk7GY5u5ZjGB+4oKv3Us3RUjhSPpNFip/MUAlNssPuc+qSByFutpVe0ONAcuhWaQ9hcc/djzXmMNuoxeY3UGusRxgc9ErCU9yhjT1KjXxFFnNeBWqrmuHDgDc+rX0dDWK3hcQOtKOiZktqeqWiZl2GKBHnGR7aqZNb9LxmRw9p3fgPBUfc3g7L/0gZbrzkWhqP286jlO++z66X2CpnezuyZp0piFLIXY7nZF6C8D+pR7toXCC19Q6rVj/l8tnr48u1+ZahWNzYfEJxhLqUpCa4I1MfhxAEVoX2X1qOw343tdZT3PgzizuBMQPlf/LVnTx12EdgHn4EdmLDvg/VHnmTKUUJNxQYVjr2M/GfjeUP5XbsF+X1D/juUEZRK9RxwH+VbnFrqDNCn5alEJoO9/P0/uTqOjQ8wfsvqR+pvkhZWXICE2k6k8V7AktKkHGBhtaj9mV0q5ziruzl50Pf8YyCqD13lwjWPCipuUvSI6ZJxIghTDbPCy2MFDgkQXZyUJyQM1Uz2FUa6x33Bpda9W3F2cy+y6znHm57bxpY3NDAcLRYy48dq9r2L4xcOJH4bHiw3h8OtGMlVDuTvHFPeMIpwrs10YeQ6woht+21QaBsULjBKkeJQ4GecNuWQcm2m4/BKOPTaOFbZ5uXRBHGsZjmJUfKIs6YgBkFppyPxSkj03TZING/flohE6nj/kGepdHQzDjeisNJReB0UOvagDQrN+8juPbMD8SyIXhvXTbZ5udptzB2J50n0YRskVtxd40fEhcRFZi9jQslGYUlZHjZ9e94EOysdkddBJCzhuSyR5l189/LccXiOQ3fYBofmPyW+5jIuqrCoNuuGFP4OlI0OwStB0HeaIyiTb98rKqoffu3oHw=='),
			this.addDataEntry(dt + 'grouped single select', 360, 260, 'Single select (grouped)',
				'7Vltb5swEP41SN2HRAby+jGvbaXuRUm3aR9dMMGrwRm4TbJfPxsbApimSIFuWhMpin32Gft57s7HxbBnwf46glv/I3URMeyFYc8iSplsBfsZIsSwAHYNe25YFuBfw1q+MGomo2ALIxSyOgqWVHiG5AlJyW0c82YijdmBKKnPAr63uWnYUw8TMqOERrwf0pBPmMYsoo+oJPRoyNb4t1jAFHqQ4E3IOwR5TA2nGoZl98eD4Qhw+c7HDK230BGKOw6M2iGKGNq/eMpEpI54jWiAWHTgU3bYZb6a0ZdIAB/hja/UFDoAxrK/yVSPmPGGgq0aQluHcNUZ2RqEEX0KXeQqFGHkKHDGJUw5GF7y0YDlI73ZeLLkG5vmCJGTvqujWkLC4cPh5i5Bet7X0QbJp0zKGUAfFJ59qZHD3R5U4G7b5+Pe03A/ZbWxD1264x1xahfGfsIEkCNbMT/Yb4QbdiEjMI4xDLsOoTHS2RkPJ2CyrDb7OhDa1RAWFRSgoKsjavZ0QFNZhAhk+BkV1qpCWT3/C8V8W9nDO9ao8PjOsLgC9bwYMY2l7BS1iOu/TlzRV2p7x3y5MBf9PNtFVzNLYck6EYdSz3A4bygqepwgGDuQTNQcRrdHr7sXncTpGnCo1HlecygLNBDJBhoxN7fr+8+rH1y4XkxWs5t/6l5QS6nNmLXQ7r9+T/RO3BNnule6zCG9klrwrqFG4tXapztumFzKdwyopxoBZI4v5Vhc+vGHpum1mqMXNERv5igt0GsO3oDfUUX0HBAB7QNvbERD5R9SytfLBrjeLY9m/J5jmIZi0fAncsQJYkRkA8v0D3gRDfiPQyPRe6AwcrvdrmYg6eXJ94i3VZclAJORDMkNGkvRMOwpgQ+IfKExTo5lzyNJbRan70rjAXZdoawF8mwgnzmUkqmm7PCtokyvDSsct558EepIK617/6cmxQ3xm3pubgu1aBudzMyyXOxEbjaqSM2aYbXTK2ZmbbCabjVH6+zrarX4dH/JAFrxzTFog0VTY/GSAvylFKAdgvWqzSUHuOQAp940yoWuZuxQL339D1mAdK/3nAbUKK2llBGcuwfyNUitQKnXaZrxosp6yLloZ29wrfhNVQWsFL9TgQhzSQxOwRv8eqJyQlrFzYmqY79co7hu6Uq4WiRVrmPsf0SH95ALvGW1Z9iALfHu8c8hOT3/39Ef'),
			this.addDataEntry(dt + 'single select', 360, 380, 'Single select',
				'7Zlbb9owFMc/TaTtgcqOCZRHbkGV2q0SW/vsJg6xMDFyzK2ffnYulOBwkcDTNAUJEV+OY/9/Pj7kxEHDxXYi8DJ+4SFhDho7aCg4l/nVYjskjDkuoKGDRo7rAvV1XP9EK8xawRILkshrDNzcYI3ZiuQ14yUNVA2jyTxvS+WOFW2xXKgZjqCDBhFlbMgZF6qc8ER1GKRS8Dk5qox4Iqf0Uw8AtR1mdJaoAiORLJpLC8dFXq/TfQSqfhNTSaZLHGjDjZJH1RVTJUKS7cnlZlXFWieEL4gUO9VlQ0MZFz28XBIQEzqLC7NCJoDTvDzbm36Jpy4K/eq1RIaWb2qudIYd1Ff1LzQNDEUFXyUhCQtRsQgKrXpHEittouxj6Kxa2sNe31eTHBzwyTu9F8t2dY1Skyaz50z4kWeKD7KPyegW3XeFvF5ucYABdWowIHQ7hraB4dw+TmMc8o0q6IWHOI0zGCBvWer+i+1Mu+cDlgynKcXJQ8B4SkxAvW4f9P1TjnCViqhexapBoSl4MEWFbVPTsk4QhiVdk8pYdUIX93/lVE1rf/OW+1i5fatbHYFHUUqkAWq/iqvYeZfZVT3mah8Z+WM49g6BVx0OHp1V7pnDqfSPQHEjoup3GjANMOsXfSRffvneL13IXO8OPlX6z0WfusfZ1jHATH9PJuPpr6efP6b/WJzIhiomA6/V2rscN9pn4saNzlUOsytDlAXf6hoIYStgNJjrPsla6agliXGqf9UKwLfpewsBhL7fm697P77gfnwR+mt828AC30eDb3/0pipa6jsOqcQfTJMNicSUZUtaU7JpOFvk3LHhxz2D82A1i+hW3ycJ9VqxEDiRuwatRbQ9Gy4MQQ1byjRUSVKZL4LkJ3SD1lr0tRJ+IaxhK5LVUtUFMRayYWqTqZWQC830yYikWmYdZz8apFaRWomu0MzijJMZTQgR6gEuWxhmarUNWYtk7QRXMzHkEyxXQkfTiGENNyViTYMmvNqka+fpFpqpo6ck1KtU/4Xnues2TK0xtRNezayTQa7M0jJ6gOow7W3kxOuSgkJF7c+92a1Jo13F4FJ+Dt5IpMzHelYQmFmjacw3uT/p/QV4lF211WMpWGAZxHkbWdIg/Y/97CTjPU/7XtdCbRvIzUSSRq7/0moip9Cezcv7wHd9r9YFH0fDMbr+ZdRxfn1Bw5CRGrjH+4bhD8JeeUol5dpQ5HT2Az4fte8Hrr43g+DoTDn5/uiW3VX7wsfca+XzR+U4ce+y1VoQHW+2O5wvqvj1bjvvfvjq+w8='),
			this.addDataEntry(dt + 'table', 400, 230, 'Table',
				'7Zptj+IqFMc/TV+OgT5ofTk+zc1NbnKz82JfTpgWLVksBnBm3E+/oLTbFpzRsVadXROTAkXhd07/nAP1gvHy7YGjVfYfSzH1gqkXjDljcne1fBtjSj0fkNQLJp7vA/X1/NmeVrhtBSvEcS4P6eDvOrwgusa7mm94xQSRjG92TUJuqGnK5FINcAK9YDQnlI4ZZVyVc5arG0ZCcvYDNyrnLJeP5Kf+Aaj7IUoWuSpQPJemuejh+UE07A9ioOpfMyLx4woluuOroqPqzEgxl/ht72y3VWaqD5gtsdTzAK8klZm5I9oRARkmi8x0M5QAErvyouz6m526MPjcKAMLpZoZRc+MI0VTfCGapkMADLUqXXAmuqFF1wIqMrTSl5RUCH43Y1PzGFWI1/EqWJPZFE4j1cKxUISLbvBEVJs6gQqpMHCQgi2Qihyk+mipjU7ldjqzsmIhy/lVQHK2zlOcmukjnhifixquuvWx+8lk9p6/Vm6ebz8Vv00UPqwaRxouSRC9Nw1LkqZ6NE7XrT4FflE2o4d1M7dgutA2XeDblivqTrFc37JcwNMnSp45al+N/Q/1A2w/7xmhAr0NPRnsehTg+xb40hhtq8vgcHVZvi30at0jTAx6JGG56K3F1okbj0bp7ZbW+FEQR3FL0IrpF9RCBzUHtPB0aPHtQgMXgzZ0QBv1T5HgGZj5s+hACS5jgvYkGDTUALQnwYW5ooa5HMpwJmEoFuRjnJzN5yTBPYGTNSdy06Ms+fG04kziRGqTWmvotD+Ow30GbIFf2HT3ocUPuoKRFtwdwo/5HeHr0/tQr7RfONyIo87CDWgnfx/6tlDARE8kBOfKxfN1QjHiT80YZL+QH+XU73s16EU1ry7LH8gCNOsWxxRJ8oJr/+/iaUbwPyNqZOXf38H6Q3U3rP+CUgGBpWWPch6HmchOKhGEm7sUieyZIZ5aBvvqUeEQOpbqc4n/EUnntUU4Yd07Y1vyzxXhQFcCeiPU/MtRs5O/m6EGLkftE4nb1YdnQzsbOVt4Zudw/z5aBI9JRuBkEhy6H1QuJbcUoMGguw0haGeLCCV3AiV/3LoPgw63g/xPZH3XIsaNhR8G3e1t+Acke9eKzb8gtk/kYdeCDVwQm50b/T3oOGVhG3S39eA4zvuTjzpg3GFW6zwg7EBuMpRka44fNNOJjqdXekMF8+mLgqbnU2wkz9CSUE3mH0xfsH5c6vb0wZk0f9Bd4uI467tZze8Smyvf+9LHJ6c9NW2Yu3H44tSqc0nVJ44Y203vr060mpsFMO5ut8B5eLnHHNf4Es4Z38JRxd8v7e02+qvv9P0C'),
			this.addDataEntry(dt + 'table', 620, 230, 'Table',
				'7Vtbb6M6EP41aJ8aAQ6XPObS7OpoV1u1R7uPRxScxKrBWS5N2l9/ZoCkgKGbpkCTtpVS+YKN/Y1nPN/YKGTqb7+Gznr1Q3iUK+RSIdNQiDhL+dsp5VzRVeYpZKbougo/RZ831Gpprbp2QhrEhzTQswb3Dk9oVnKVpA+E9E9CozjK6qP4gef1q9iHUc40hUwWjPOp4CKEfCACeGASxaG4o5XChQjiG/aIHWjYzuFsGUCG00WcV+9aKDoxRqZlq1C+WbGY3qwdFxtuACIoy4dLw5huG6ecFuXz/UqFT+PwAR7ZMC9e5U8YGSzqirLlKm+WQ6U6UZZf7ps+AQiJHMN6PImE5zW9Z3RDw/eEZN5gOMoRKyKrdoTsUEJ2kjDuvUNYjRpYSUeoGhKqEp7RylljkrMCgL/zocE0JgXAy+gCVrP5pXZpQE1IIwB410x7JVIPZQQKQJl6DVJaC0iZhyPlb5do0AdMRNaAuSKIBklEw8qCBHQW6V8dbrpBbMNuB6XhUEJpp02l5TR8PUiWrKQ3l9e/LiwTREDGUPUz4Di0BQtpusvgqgAdVuk9zAYTbIE5Tn3IDwYDBYEn2BqgMDmqY7R2ghLw5p9E7PT0YpNPCV8WiNB3+NMDkFrGhZ6wQXNPUWoRsB9NW2+LvajuXlJPhTu7IL3thxO6DEd88+g+Uhh8dMcgd6HgUiW2OgIlBGRV7kQ4mmTtOTH18LXw81mQxClCzlIgPNjRNV1jejyZ7mYCgskmU54gFGdo7YrbtZX6X22lmv412Mq0q3wwr7UIeQOSr8Dd0tdkS2rWGAjSgoGwX24gnDAUm0gfQHm4HmMGEfUeAIyZOrDTzBYzw4GaZeD/zBiMssdI+hgoCNZgxhrA/MkkELGLs1UbZVg2Q1NtaqUPe6CVbswEypPiamxHJjt0m+2RZnZjtEeSTKLYWbJgKYkmFEngUS9fiaCx+Ro3ZLjm+pzMjef0o85Z2OmJC6ilewFiylyHj/MKn3kejqZZVQpaV1WdgiK3ITHDKEmMjCSJdeVA76ReUqOJ2ahK0Jqto5pFPVdBTm8oJbUiJbV1KRmkLKUe93lNOz9vaIea9naoyWz7XFAbjt4ONZlTK5e6Auo6rku82FCoqmHN7AMNxR7tczIUplrZgO3DNmCzBeHJtP3kl3yOki1vep0tcZmGz6kTJ8iR5imDml3+utCABtnYyl+L8J1wo++Ji5BPnJTXPFEivYkSGU2caMLi28S9o3FKK9ciYrFAKXzyo2f4kW1Ka7wzfqQdEUH5GARJH5Y31xrL0xVB0uSIzaLG8uiptWkQFkKCEb5PBlUQqVXecu0azruTeusUSo5EjP6qabdOxNyBgDb/AaJcJLEstr0kjhJbbgC78pO4c0v5FZr9TD3DDNT9+75X6vfvbcM7HpalPSKHKbDRgrDlEMfJO1gN/LVHh0uvizKcCWra26F2vqy/yl/7RK2G9Z8Tf13Ae7/lRvb0uOyhprYFLltzuH/yyz9HSSP9xWvqTuoLFNbQMt44Y5Fzy/EQMF7h/y8cKF4Uf4Fkehao4CEhh7WZRuvPnujOKWfQXP3m0IDyItc17QauizJrPv/75LcH8FtYb9K674zgvuQyxcciuGSoV8TS3xFgzcWNzzPAQ2Rmlj0mTZddpq4OAWvukXy6TK25TBrpL/5/zK2IU/GZrB45gszi6w8AwN1NnRFX+D5Dd4HfZ7d18ZLpqR4JZL38I1Y4jl/paGYgV139LkTRE8LJTeo8IYRH/eliIfQ+PD836Nkroz24QVaPcX5yRGzlg7hBlYtQdRamKzeIyLGbvt2gsTGeTcbn5gZVrkJpluy6dvYxgRw5+rsqHRLI30viM5D/fCBfs/uL5JO68NLkCO/2491869NVI3J46+Q92oajg15hOyI4ciKwVc8OeoXtBZcmGg1Cg7kvAtjK6qoEeSxLgmkkozRqAaSacMEzLj7g5YlNbpg8J1qlvo6a1ZTd0hioSMScYOCuqHt3K7av3EvfxfXBgzfFFuIHRI4f/LtiGA6/usbXOZi8pRTpoE/DJdLF491ZzdInw9nbybLqznawc5ZFuacWJVF25c6+4KrCKX5sqMths7a+NoTs0zffaV3pk/D/AQ=='),
			this.addDataEntry(dt + 'table', 630, 230, 'Table',
				'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'),
			this.addDataEntry(dt + 'table action', 350, 30, 'Table with action',
				'3dbPb4IwFAfwv6b30oo/roJ42snDzs180GYPSko3dX/9iq2Kq0uWbbhkB5P2vX6h/YQghGf1fm1EKx/0FpDwFeGZ0dr6Ub3PAJEwqraE54Qx6n6EFZ90k2OXtsJAY78SYD7wKvAFfCUHKxR2vt7ZA4a6tLXbXZ4QviwVYqZRGzdvdOMWLDtr9DN8KJa6sRv11l8g6XMCVdW4CUJpQ/uUIIxzPp8UxSkWbtzHdlJZ2LTiqS/sHFXYMxgL+0/PfSyFQ69B12DNwS3Zqa2VfkXqaagEVcmQClxUdH5enZMXRDcIjrdNeWyqyvL+oOliOpvTsUFDYBbgBr6TkXwnkW+m61rZP3hm70qc8Nh4OpJxGhtLgQhNBf+dmdGYeTES8zRijnA7Kdp+iGqg+Ri25o6xHOhfUzu4vFglq9R1DHRO+xRLfsJ0uD7+QInfeqMmv8A0G5np/NdzF6Zb78VvKLnp5Tvh2Lv6jHgH'),

			this.createVertexTemplateEntry('dashed=0;html=1;fillColor=#F0F2F5;strokeColor=none;align=center;rounded=1;arcSize=10;fontColor=#596780;fontStyle=1;fontSize=11;shadow=0',
				 60, 20, 'Tag text', 'Tag', null, null, this.getTagsForStencil(gn, 'tag', dt).join(' ')),
			this.createVertexTemplateEntry('dashed=0;html=1;fillColor=#F0F2F5;strokeColor=none;align=center;rounded=1;arcSize=10;fontColor=#3384FF;fontStyle=1;fontSize=11;shadow=0',
				 60, 20, 'Tag link', 'Tag link', null, null, this.getTagsForStencil(gn, 'tag', dt).join(' ')),
			this.addEntry(dt + 'tag removable', function()
	   		{
			   	var item1 = new mxCell('Removable tag', new mxGeometry(0, 0, 100, 20), 'dashed=0;html=1;fillColor=#F0F2F5;strokeColor=none;align=left;rounded=1;arcSize=10;fontColor=#596780;fontStyle=1;fontSize=11;shadow=0;spacingLeft=3');
			   	item1.vertex = true;
			   	var item2 = new mxCell('', new mxGeometry(1, 0.5, 6, 6), s + 'x;strokeColor=#596780;strokeWidth=2');
			   	item2.geometry.relative = true;
			   	item2.geometry.offset = new mxPoint(-11, -3);
			   	item2.vertex = true;
			   	item1.insert(item2);
			   	return sb.createVertexTemplateFromCells([item1], item1.geometry.width, item1.geometry.height, 'Removable tag');
			}),
			this.addEntry(dt + 'tag removable link', function()
	   		{
			   	var item1 = new mxCell('Removable tag link', new mxGeometry(0, 0, 130, 20), 'dashed=0;html=1;fillColor=#F0F2F5;strokeColor=none;align=left;rounded=1;arcSize=10;fontColor=#3384FF;fontStyle=1;fontSize=11;shadow=0;spacingLeft=3');
			   	item1.vertex = true;
			   	var item2 = new mxCell('', new mxGeometry(1, 0.5, 6, 6), s + 'x;strokeColor=#596780;strokeWidth=2');
			   	item2.geometry.relative = true;
			   	item2.geometry.offset = new mxPoint(-11, -3);
			   	item2.vertex = true;
			   	item1.insert(item2);
			   	return sb.createVertexTemplateFromCells([item1], item1.geometry.width, item1.geometry.height, 'Removable tag link');
			}),
			this.addEntry(dt + 'text field', function()
	   		{
			   	var item1 = new mxCell('Name<sup><font color="#ff0000">*</font></sup>', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('Messina Cake', new mxGeometry(0, 25, 290, 33), 'rounded=1;arcSize=9;align=left;spacingLeft=5;strokeColor=#4C9AFF;html=1;strokeWidth=2;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 58, 'Text field');
			}),
			this.addEntry(dt + 'password field', function()
	   		{
			   	var item1 = new mxCell('Password<sup><font color="#ff0000">*</font></sup>', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;', new mxGeometry(0, 25, 290, 33), 'rounded=1;arcSize=9;align=left;spacingLeft=5;strokeColor=#4C9AFF;html=1;strokeWidth=2;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 58, 'Password field');
			}),
			this.addEntry(dt + 'text field', function()
	   		{
			   	var item1 = new mxCell('Project name', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('Watermelon Squad', new mxGeometry(0, 25, 290, 33), 'rounded=1;arcSize=9;fillColor=#F7F8F9;align=left;spacingLeft=5;strokeColor=#DEE1E6;html=1;strokeWidth=2;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 58, 'Compact text field');
			}),
			this.addEntry(dt + 'text field', function()
	   		{
			   	var item1 = new mxCell('Project name', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('Watermelon Squad', new mxGeometry(0, 25, 290, 40), 'rounded=1;arcSize=9;fillColor=#F7F8F9;align=left;spacingLeft=5;strokeColor=#DEE1E6;html=1;strokeWidth=2;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 65, 'Text field');
			}),
			this.addEntry(dt + 'text field', function()
	   		{
			   	var item1 = new mxCell('Location', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('', new mxGeometry(0, 25, 290, 33), 'rounded=1;arcSize=9;align=left;spacingLeft=5;strokeColor=#4C9AFF;html=1;strokeWidth=2;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 58, 'Compact text field');
			}),
			this.addEntry(dt + 'text field', function()
	   		{
			   	var item1 = new mxCell('Location', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('', new mxGeometry(0, 25, 290, 40), 'rounded=1;arcSize=9;align=left;spacingLeft=5;strokeColor=#4C9AFF;html=1;strokeWidth=2;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 65, 'Text field');
			}),
			this.addEntry(dt + 'text field', function()
	   		{
			   	var item1 = new mxCell('Details', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('eg. ATP, VOSS etc', new mxGeometry(0, 25, 290, 33), 'rounded=1;arcSize=9;fillColor=#F7F8F9;align=left;spacingLeft=5;strokeColor=#DEE1E6;html=1;strokeWidth=2;fontColor=#596780;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 58, 'Compact text field');
			}),
			this.addEntry(dt + 'text field', function()
	   		{
			   	var item1 = new mxCell('Details', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('eg. ATP, VOSS etc', new mxGeometry(0, 25, 290, 40), 'rounded=1;arcSize=9;fillColor=#F7F8F9;align=left;spacingLeft=5;strokeColor=#DEE1E6;html=1;strokeWidth=2;fontColor=#596780;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 65, 'Text field');
			}),
			this.addEntry(dt + 'text field help', function()
	   		{
			   	var item1 = new mxCell('Form label', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('Banana bread', new mxGeometry(0, 25, 290, 33), 'rounded=1;arcSize=9;fillColor=#F7F8F9;align=left;spacingLeft=5;strokeColor=#DEE1E6;html=1;strokeWidth=2;fontColor=#596780;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 58, 'Text field with placeholder text');
			}),
			this.addEntry(dt + 'text field tooltip', function()
	   		{
			   	var item1 = new mxCell('Selected help', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('', new mxGeometry(0, 25, 290, 33), 'rounded=1;arcSize=9;fillColor=#ffffff;align=left;spacingLeft=5;strokeColor=#4C9AFF;html=1;strokeWidth=2;fontSize=12');
			   	item2.vertex = true;
			   	var item3 = new mxCell('<b>Not great</b><div>The best password is hard to guess. Try again.</div>', new mxGeometry(300, 0, 180, 80), 
			   			'html=1;rounded=1;strokeColor=#DFE1E5;fontSize=12;align=left;shadow=1;arcSize=1;whiteSpace=wrap;verticalAlign=top;spacingLeft=15;spacingRight=15;spacingTop=10');
			   	item3.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2, item3], 480, 80, 'Text field with tooltip');
			}),
			this.addDataEntry('text field tooltip', 500, 60, 'Text field with tooltip', 
				'pVXbjpswEP0aHndlINDlcZckm0qtVDWV+uyCAauOTW2TS7++Y+wQiMkqVZBCPIPPmDlnZgjifHd8l7htvoqSsCBeBXEuhdB2tTvmhLEgQrQM4mUQRQh+QbS+8TTsn6IWS8L1PYDIAvaYdcR6NmJPJLg+F4LD34aw1u5R+sTcnooylgsmJJhccPC+KS3Fb3LlbPQOMlqGsKwE11v61wQIjY0ZrTkYjFTaPT6DgyhOsvTTCzrD3MFzYdzrE6nJ8SYFvcvl/07Ejmh5gi0HWurG0bCwNKGG0LpxMEcdwsra9QC9EAoLx+k8v7HH7xYzZk7fYK4Mw1fUStHxkpQuXSwLl21mkh/RDiRV/eVzqVpcUF5/6a1l4okD0EWeva7XU4Xspp+OlMgXBfXXlQjRgyKcHNeJRYw1yWY0iePHNVl4mlBPBtXg1iwBSVt1s8CvFEmTZJEjn7lBqY/K+W4m43kmpwDHK3r2iQ1ffF7PPkkY1nRPJrHmyHbnfxMUXms4/CleTI5/yqYRRFUpoj2xhizu0i/xewrgZoNSHVHmOGlMLsyb4T2mDP9ixlN25q6FuTVmGUQpO48fMItBsvRPZ0bwm+mVIsMg3siV1j2GElb2IF7RupPAm+DP54iQhA1qN3sFNmq8acvfanKvh5frVbhKZoro49E6dDGUeCkO3qAx1qGhmmxhjBjHAT5O4DNFSQvMXl10LVpv1oTJxfXdFdfY98NgliF6cGY4AKTiDw00MzTS/x/kYF4+wrZGx9/ofw=='),
			this.addDataEntry(dt + 'toggle subtle', 30, 16, 'Subtle toggle',
				'5VXBbqMwEP0ajkVgh/TcpE1OK63UL7DMgK0YjOwhTfbrd4zdpklIW6m9FQnkeTPjh/2eIePr7rB1YlB/bA0m408ZXztrMY66wxqMyVih64w/ZowVdGdscyNbTtliEA56/EoDiw17YUaISAQ8Hk0CGm3M2hrrppDz5Yrf01wrj87u4DXT257qV86OfQ1h8pIi4eSz/hfmqYrQsQOUiqIQKCHV6GArBgIWBAxW9wjuaU+v7lNRY3vciE6bIwEPTiqNICnLikcxtorKU9GzHZ0MRApxoHzFH+hByw6PUODz1trWgBi0z6XtpoT0U+mmiRQ0PCOp2OqSJq6GhXdLOwcO4XBz9ycobf0WbAfoiKd40TWqWMGjQIUCTUypaxkx4WPcvnWepKRBUnNeWf65sl6JIQypUQ8ebml6YYBmun6nnGxezvOGYzp4eRXjd2KXbEbshDkwAvUezuaac0Di/xs2+ER+Vy7O6O8uPGSbxgNeOehtFV8y1eJzUynsTDr+5K/aviTta+HV9GEoYmZyXndow6cvF2iE91r0uVQgd1dOnLVd+dtt94HRltc+q37EZhcm4983GYWn/10sf/87/A8='),
			this.addDataEntry(dt + 'toggle bold', 40, 20, 'Bold toggle',
				'5VXLbqMwFP0alkVgh0y2TdpkValSF7O2zAVbMRjZJk369XP9aBOaZBqp3RUJ5Ps8+J6Dyeiq228MG8STrkFl9DGjK6O1i6tuvwKlMlLIOqMPGSEF3hlZX4mWIVoMzEDvbikgsWDH1AjREx3WHVRyNFKplVbaBJPS+ZL+wV5L64zewnuk1z3mL40e+xp88xItZviLfPN9qsJXbMFxgZY3BONiNLBhAzpm6Bi07B2Yxx2+uk1Jje7dmnVSHdBxb7iQDjhGSfHAxlZgekp60aPhHkg4N2C8ovf4wG37h0+weat1q4AN0uZcdyHAbUhdNxEClxOQiiw/w8TdEP9uaXJgHOyvTj+40ug3oDtwBnGKV1k7ETNmkaBCgESkxEryMRvt9qPySCUuEpuXmaVfM2sFG/wSC+Vg4RqnnwTQhOt30kku0zktOKQPL6+ifUJ2OT8n+91nQDEndzDpdUkBCf/ZD/gIflcuJvB3i2kH3TQW3JmCPnZxk6hmX4tKuE6lzx/1VevXxH3NrAgHQxEjQXndvvVHX86cYtZK1udcAN+eKXEiuxD5m4ZKToVY/nYh/k96F86ZxY8obz7VXfV93aF5/AXG9NM/5D8='),
			this.addDataEntry(dt + 'toggle bold tooltip', 280, 112, 'Bold toggle with tooltip',
				'7ZdNb+IwEIZ/TY5FjkMgPRYCvXSlavewZzeZJFadmLVNgf31a8eGEpwUJGC1h40E8teM8fPOjEkQzevtsyCr6hvPgQXRIojmgnNlW/V2DowFGNE8iNIAY6Q/AV4OzIbtLFoRAY26xABbgw/C1mBHnhjjG+Nj3S4U8GsNUkm7Tqodc+sKyticMy50t+GNHp1JJfg7nAxWqtanSkPdLHijftDfxkFo+oTRstEdBoVy03vjAEfx42SaoL2Z27jPjTsCCAXbQQztkGPwDLwGJXZ6yYbmqnIoxhYVqoCWlTNz+BCRtl8eTD+h6obj2s848hh/CVMfPZrMouliiKjg6yaH3NEgInMwYnQljJ07c2wtjtjcC834PBpZkZVpakO6koNhdkKwaJ9LeUT9PLoGjg4a+XjCiY9nPyaAEUU/oOOrj5nb/5VT/bMOmz+ESWf7h6TrgReFBOUxP5ziIhni8zIcpbFWJNclIkpNvOVEVm0sIjvTalVvS1PRRkQxIiUlzSirIHv3tDsWys78dFDxldJ9JVZPLCc30WrSVSq+g1ITT6mUSvKmVTpfsYfqRoj8/AmneDZOr6jpmVYIhF/VD3ofV3V046ruDMZxR5CeuhaG8X0K23TwXuWq0lwwWksQWiOkuP6qQZRGQlVRM/YmSJNVxp4ST9h/5Ca+tWZOpBh5IuHkTrdP4on0HTaCKtqUZjcqFXcOh9PoJG+WaImXcV+hS5N0voh8uKh9fA0MRZoR9uSGa5rnDM6IYMomI2/AXrnU5+DGUFhoB4cvJ/MHx3JFMn30l3Z/WxUuqvo3yNRuok57EhX33LD4+hB49EJgts89/W8cWkT/A+BvB0CI/CpwowjQ3c+3K3sBH798/QE='),
			this.addDataEntry(dt + 'toggle bold disabled', 110, 20, 'Bold toggle disabled',
				'tZXfboIwFMafhktNoaLxcqjzaskSn6DCARoLJW1V3NOv0KLyb7rMkZD0nPZ8Ld+vLQ5eZeVWkCL94BEwB28cvBKcK9PKyhUw5niIRg5eO56H9Ot47yO9bt2LCiIgV88UeKbgRNgRTMYkpLowm4gpYyvOuKhDjOcBXmitQCrBD9D05DzX4wPBj3kElbirIyLCHf2qdHykQzsXCAXl6HrrlF3sFngGSlz0kEtrvWcaqdRksPlAlAJN0kZjbnJEmji56tys0A3rxrAz+LEzMiVF1dSFtJAw5knHwOXbehlsnrXDG7ajXWDNQVO/Z4/rDdhjcwIYUfQELa0hz+z8n5zqZV0nn7iz1vSTjus8jiWonufXr3gKw+wxhlRlzG44TSTiZx1U2y0iMq23IjI9NausTKrDNiWKESkpyadhCuGhx+5VoH5AM++T8V8CpoMF/wMWv4dld9zLUNC9drwLaOxScFH/dLgLL5itx47SHeqY56rRqWUZTXIdhJoICDvgTjiun6bQLg4NCP3llrIFuA974fdp27v5N9eUDm8/B8Pt/t/xDQ=='),
			this.addDataEntry(dt + 'toggle bold disabled', 110, 20, 'Bold toggle disabled',
				'tVVdb4MgFP01PLZB0HXPtbNPS5bsYc+kopIhGKCt3a8fCrZadW3SzsSE+3Eul3P4ADgu660iVfEuU8oBfgM4VlIaNyrrmHIOEGQpwBuAELQ/QMlMNGijsCKKCnMPADnAgfA9dR7n0ObEvSNjnMeSS9WaOAkSlIQAr7VR8pt2ESGFzV8ruRcpbYoH1iJq98l+mjoRtKafiypD69l+W5dvdktlSY062ZQjS03hMkK3JFhQlhce5ZcJiXZ2fkZeFm8Hfv3TXODbXOiCVM3QAlml6RwLV5TFKF5t7iYATRNw8nIuIwfpERK8jAnpfIpyYtiBDqabYsnP+CGZbQTBerA//OSL1yFeZpmmZsTxueu7aA9v016YkvstZRVI5dEaDZ8p0UW72aCLtNqUdd4cpyUxnGjNiFjWI536orjIl6cTPSjTEPCHaBOaPUeyRXAlGv4H0aKRaDERO5tj5bhWb+5OCOD4qAQrtA43c+eqtw8yKUxXpy3LWS6ssbMCUeUTeoWz9uuAvjk4UeiRS8oDwgm1o6fcWda8vA1Otv7T8Qs='),
			this.addDataEntry(dt + 'bold subtle disabled', 110, 20, 'Bold subtle disabled',
				'tZXdboIwFMefppea0oLei9OrJUv2BI0coFmhpK2Ke/oVWlQE1GWOhKTntOeD35+2iMZFvVWsyt9lAgLRN0RjJaVxo6KOQQhEME8QXSNCsH0R2UzMBu0srpiC0jwTQFzAgYk9OI9zaHMS3pFyIWIppGpNugk2ZBMiutJGyS/oZkpZ2vUrJfdlAk3ywFpM7T75d5Mnwtb0tUAZqCf7bV2+2S3IAow62SWnXr9Hnpjceaj7QJwDz/Iux8L5mHZ2ds5zQWEHnsY4GfqYjM5Z1QxtIK80TDG5ARiTeLl+Gge5iwPPowGQgIwA8T4Fghl+gF65MUq+4ofkthGC6x59X3x2Q1mmqQYzYHzu+ins4WPsuSmE/8GsAok8WqPhmTCdt78edjOtNkWdNZtrzoxgWnNWzuuBTq8SpR9wR6JoqFD0EoFmAe5LRP9BomggUczKnV1j4d9qNXUeBHi4MYIlWYXrqV10pXoqS9PladMKnpXW2FmBQPkFV4nT9ukCfXN4JNFfDigfEA7VXozI7Y/l35xQ1rzcC06262vjBw=='),

			this.createVertexTemplateEntry('rounded=1;arcSize=10;fillColor=#172B4D;strokeColor=none;html=1;fontSize=11;align=center;fontColor=#ffffff;fontStyle=0;fontSize=11;sketch=0;',
				 65, 20, 'Tooltip', 'Tooltip', null, null, this.getTagsForStencil(gn, 'tag', dt).join(' ')),
			this.addDataEntry(dt + 'comment', 470, 125, 'Comment',
				'3Vddb9owFP01kbaHonwDj0BLt2pbpX489NFNLomFY2exM2C/fteOSUNdqkkt27RIIfb19fXJOffaxIsW1fayIXX5VeTAvOjCixaNEKprVdsFMOaFPs296NwLQx9vL1weGQ3MqF+TBrj6nQlhN+EHYS10ls4g1Y5ZgyxJrZvVttAwR1TI8YhmgstRK6HxovmKMrYQTDRmQrQyF9qlasQaBiNhEk2SiV0SGgXbo7CNyWK+BFGBanbosqG5KjuPyEItgRalOrQR2fWLfuYTB9iwNLxMSeRQckUrNMxbzikvpENQqSqMdR48Y4ILDg4J1rgSXN3SnzpAgK85J4wWHDsMVsoOD2jzzYX2TUkV3NYk0xM3qMZbqLQT4i5BhsxOfZdZm0dvYjZ2mJ3d3326vnEYbUTLc8gtqaTJLFeJm2zLcBktk9d4Hjgn03Q88Qd8Z0iSSWFNIc0Im9mBiua5RvMC5Yfq+fu+Ra8B9wnxdnWCMHHkSZLTyJM48kQYFaf5s7ZopcJG6Afpn8//XrZT5H8wdQsgCE5UAalD8V1J+Br3FH+Fbxv6qgQNpcH3PGvr0X+61+wOGR0w37u8N/Njh/kH0XphSipd0aQW0uwC6FLhy1CkLu/laIBIPO56kTLUrMCjoHfgpIKROSJ0kWxKYh7QwNEQpWB5FwHpF70bWm04Lbu2M4Fe0RJbn02YCqpH0BEQO9vrpzH1EqbfW/3vYY5ixtmU4Ek8MA1yaW98JNm6MDvumQ0y0ysVjx/CODYL6S0gjJNBe/xxGDQtzDP2r0BKjXyOazR7gKhMh9G6IYa2KECq5wzumdUNDUqrx/HnivCWmDTCrgF3A93zAe97vL9d409rll4IvkKJOabtv1Q77gmjxAkqKnZPizh6oaLSd6ioiVNRN1CzXZeaXVkhJxO96RnVL3Kqjg6eAwMFR4e/0PVf0POk584z5QLfle69NkPsPn1RmLGDD45f'),
			this.addDataEntry(dt + 'linear discussion', 470, 125, 'Linear discussion',
				'7VZtb5swEP41SNuHIseQpP2YkrWb1EqVWmmfDRiwamxmGxL263d+oSFVUrXSqn1ZJOLzHXe+l+exiJKs3d8q0jX3sqQ8Sr5FSaakNF5q9xnlPMKIlVGyjTBG8ET45ox14ayoI4oK8x4H7B0GwnvqNRFecXC9riREwKiQXCpnWf3qbVbXEU6WV6v1JZqrVnVYnW8+Ke6JMkxAmAfSjZMVsskPHgivI5zBuukUs6ktVmAkbQdWketuFhYcfVbHp5VsmKkgvQU6bf3OIPwjaf15P+BpyEBhkaqkipYgjbJXsAi6s5ml8xJRKwUzUsUg/myorYrZDhGl2ED1IeiOuRYLaVg1+phvVHSc/euUiSinCKggwg2ktSl7A0yH08JMqVRKQnHI0Mam8gR/JQUsmBbQEL995mutRYU2Iw+o0A3prNjua4vVmEm9jlkhhY57TZXFC1SdvYAlqdwP9Noo+UxnFrxMLpeXAWGP7LcNu8C2Vs5qARtOqwmAMzfkfqDnJKf8QWpmmLSvK1Y39v3GtNyGAnGgALuC8E2IaKRtuu5IwUT9ZDfbCweSoLpzJ26XgQzgTfdnCeVUgU23FKZh1OimXpomkCr1Xg31qc11RPt9/eJ5YCcIgaCnyZp8LlkdM9Ad2UGtBf3nbN0oi/MddUD0lOqUHFgNAztLTujuTaChaWRv2x9iSMHHKUTpuM5JB8DQjqq7OI4/wkvPxcBLKSqmWnsvvGceaXFFgBnz5A9Em5Q5KZ5rJXtRXoQgG3hP1fkXnKbuoMz1YDmT119PDDlF0x18ZirIdez/1fCJV8PoresQ5O/fFLA9fDI429EXxR8='),
			this.addDataEntry(dt + 'nested discussion', 450, 160, 'Nested discussion',
				'7Vfdb5swEP9rkLaHRMSQpH3MR9M9NOvUdtqzgQt4NZgZk6T763dnk4Z0ZGmkbtKmIRHO98V92L8LXjDLt9eal9lSJSC94MoLZlop46h8OwMpPeaLxAvmHmM+3h5bHJEOrNQvuYbCvMaAOYM1lzU4jsdGEk2nJbIr8yQde/StppCmUhTQy0CkGa4mqBKi/+FejlTaPK2XlcI4mB8rqfSBI48Fw8vR+MI/bhvtGHf8K/q4z3i2E2FC0V7dH2DUM3x+VGvII9BIInPU0nZxHPpHdvmS9zZZJ2J9TiHC+JKvVm1WRwwRjx9Treoi6TVOKBCdRu9YGHrUZqoAC4ctevy+I8bQX3JjMtigypf6aI3IQ8wL/N0AvQh6uqaVyUSFD1XExI41cIPEAhJB+TlZbawiKSSKQl20XtNRnD/aie4QzmzZsb17B6V8og5cMQ/lEzpcV640bdYcJFDZDpg34hFOb9mT5WMHhWNVxksi821KKNMXqhr3RayKql9XeFQwTyHl7DnJYGUv5FdGq0doSdgwuBheNJW5F9/JLR69YMqlSAtcSFjtCtcy8+1FzeMRyE+qEkYoUteujdPM5JJcIbkGbUTM5aTxaFRJkZQ8FkX6QIt5b+DvWTf2jfNhA2NoDdujUGhZDQ5eg8rBaOrVRiQmcxpBg4e7Hdbm8cqt02fLPa4i0UBrN8wGfwPMHoGFNtCe2J5NGD/nQ4JeZXcMZTPwy+0vA/qN+Df5/PDh9q47v9ckd2aN/UHwhrPptFILHu5rDTv4dkieKIvL3PSpycTP+JoenEpe5zm3B0JDqTTlCnigiJFjhBnZPDjwpx/MILAn0eG85JWxY6Fp8VJFQpJgAZBQ72iCx0pDzHWCdA/v29iozop0YNyrkj+3Qv/uSDhRif8z4swZ0RiE7t+0/+SW48Zna4LQPn45QXa8MyYILvcfAVZ28I3wAw=='),
			this.addDataEntry(dt + 'comment', 320, 213, 'Comment',
				'7Zltb5s6FMc/DdqrRhgCSV62eeg0bdK0XWnaS9/gBKsGIxuSdJ/+HoMhATsPvSHtNjVSVXywDf79j4/PSRx/muweBc7iLzwizPHnjj8VnOfVVbKbEsYcz6WR488cz3Phz/EWR+6i8q6bYUHS/JIBXjVgg1lBKsuUJ4kaXNpl/sy0Pc4TeLsZcvyHFWVsyhkX0E55Ch0eZC74E+kYVzzNv9NfagIUQBszuk6hwcgq17frEY7nu+UH7NuY5uR7hpdq4BbQgE2/JhE52R1damnS63wkPCG5eIYuWxrlcdVjUtFwY0LXsR6lCblYVu11M3LPDS40OjtG38Bo8JMxztQloxZgsPxgEo7GavkHoK9Z9XN7dQcQfM9CAfVAYXg5hWS3Vj4/oFyOBnTJUzkoJBEd5wIsq/JjA+YF/jgYX0lp16akoQ1t0Exmte0aZoHB7BNNwPBQpClN17Lvfei93T7UA8KzrG+1S0ODtQ+zwjD3vlgXEmKe67kofH3kzd6/EXIUnGWO0I2gjwzo/8Q4fQLHdlewfs/NY6JeRcDK74ps8Nc7fGjCbwTpG/7YgP+TFx82Crg65CngihoJBMESAnEjzBJ0WkMMajqkOCGDMjaprbKNcfmPCHJ0ipizqJoBkPOmG1j1dEpqZWccevmL30x8JTtdYnavp8i5ssZ4GReCPKousyEYMk7TnIj5BpAqsVz9mAVOKFOqfyRsQ9RMN3GocWA6VGhxqCC43qEmhkN9IxlT7+bMPQdi2L26/Zk+kTc4uW4dRjvckSWM3mwn1+H5z0+u0Pj1siuEzNPnOauiDkwWl7GpQ1HwIo1IpD0Vi6V2wMkJfh2/lOB6MPXnsjULbIBn8zmah+10v+r0Q2PxTjh4d1/cwLktKlmjiu/3IJNZhp6KHuDnEd/qQBthGZdqudWd1g74F0u6HCwFl1JhinZ1v64cQy/wwrmpcGO/jPCZNKxF2B2YcRsNTcC1TRCGc7ohrbls1PXzv6pTaf/wuzoZ0I+/G7Vn4KuVJLmhWrOKy4S8oBA+tr+giD6O33o69BGbxm23ryEdaGKN6MMenP4F5TKMpJkkF0dwDejFXyX4J2E1HnvCgy0O3JP/orZSd53joR//Ncvxd01OxZRXkMSs2t8lOS5J+AqKmCX9mSB/cdo5W0BWFBwe8aitz/64GPb01cikU50jQyvkW06A0biHE8Asz+cRNb9638N0TZiL4SJYjI65ditVOuRoFlKH+WQ7gUV1ymkrEASRMLBOWi/fQyO7LOe41+nm/90mtcy32BdmcQwRieTkBYKeKobftbRr6U+uFxOa+x/dqu6Hv8n9Bw=='),
			this.addDataEntry(dt + 'date picker', 240, 58, 'Date picker',
				'5ZVNj5swEIZ/DcdFxoQsOWYD5NKVKvVQ9WjBgK01GNkmm/TXdwAngYVoV+qp6gE0H54ZMe8j7IWH+nzUrOWvqgDphakXHrRSdrTq8wGk9CgRhRcmHqUEH49mD7LBkCUt09DYrxTQseDEZAdjJEGDkoJZGFPGXqRLlULKg5JKo9uoBqMvxmr1Bh+C3Nb4IUmAZqka+0P87hsEN991JOgzKaoGbQmldelrM4+G0W77HJMPZWttzRvYnLskZznvNBxZi4ENBlolGgs6PeFSjBvcd8hYLeQFA3udc2EhxywlCesqjsevY1Sn834Qt7bFfBTu8YUL7V/9AeNXSlUSWCuMn6t6SORmOJqV4wg0Z0Mi+jIZ4zQAbeH8UMch5EQ8gqrBauxL3kVhudNyM2pNOAhs7YIuxszoV7fSOxVoODDWIQkXkPzCpWCkYfWSEq26poDCicF07oTa9QudEIT6Zs9ZnO2WGJiW5aKpvg1eEi04w9IkTYN0O4dtPPTTbYR+xpPjh/7X/FwcJtFYMcEpiFZwCsO/x2mzwGnBkOGs7c36XPW/Rr+qC+nnTEJTML3kKNpv4zh49Du6iUv+RXEnqFLyVbHDdbHnBU564q9oHy+lv8Y0SGbFCWa91nhw87/3C74Pf6K72fin3byDKksDdsHT7SvWEEP3fmWOx6c36h8='),
			this.addDataEntry('tag1 tag2', 240, 58, 'The Title', 
				'pZRdb4IwFIZ/DZea0orC5QbqzZYs2cWyy0YO0Ky0pFSH+/UrtqKsmJl4QXI++p5ynjcQkLTutoo21avMgQdkHZBUSaltVHcpcB5gxPKAZAHGyDwB3tzohqcuaqgCoe8RYCs4UL4HW8lMgFFONdhWq4/ctQrGeSq5VCYVUpjqc6uV/II/xUrXZpEsNGEhhX5nP/2AcMjdRGRyylkpTMyh0K59HhZgEiXLVYz+yKbGui1AaehukjiVHIYtyBq0Opoj3yzXlaOxsLRQBaysnMwRRLS1eTlIL1xN4NBOYyYe5k+5V6YiaO1zVnIvcsjdrlTt3KpJv/mVB4bQZrWJN4kPsm3ojony5ZRlkeeUkWbrdbheju2yhz4cEfyfI84B/KADRwc6soorQ8JowhBCHjdk4RniudBWtOnDuiv7z3Ne1jmf7ygHkVPlOxE9LeM4vPVJ3IWHTOMZCxwsNJ+gFfuwzjUFnGp2gNGsKYLu/jfJzGsNl89wMrp+lownyKJoQXsODFtMmWLSy4/OHr/+D/4C'),

			this.addDataEntry(dt + 'date picker', 320, 415, 'Date picker',
				'1Zxdb9owFIZ/DZdFthOH5HIl0E1au2lt1euMGIiaYBTSFvbrZ0igkGMqtvorSJXyUSfk8bHzvj5H9Lxhsb4pk+X8lqcs73mjnjcsOa/qrWI9ZHneIyhLe17cIwSJvx4ZnzmLd2fRMinZorqkAakbvCb5C6uPxGKDoDSpWH1qVW3y5tQ0y/Mhz3kpdhd8IY5er6qSP7PWwXlViAeJsdic8kV1n/3ZXgAf9psrIrGf5NlsIbZzNq2a0/uL9YhHo2AQolYzeNn6EVhZsfVZDLtDDYMbxgtWlRvxL29ZWs0bFH6NCs1ZNps3zRp8KFnV+7ND03eoYqPhKmfsAcYPPE02AG/JXxYpS5tHTMpJ84TR9oGP0Asw090H8lstk0m2mH3f7cUUdJBoihAdxOFpL9X/9NSwILAjCPVCGrbAk8+A3zR8ad3iqB8wlfSD532+H3zQD6ALVvNkud0s1rPtkOzPijTvT5KcLdKkhN1wwCIZBpew8eRsThs0pFBfgiqEpPbHSpYnVfbKTq4lw9fc/yfPxNc63PyKRCe3v4pOr8Cn0xWrAP7DU1zUI/Tfe6Tgk+eXZX/Ky2LVL0s22YZ92YSkNODj8QiP6AdjSNwi5W+7ofD5gA5gL3lEFtBUwcwSAH53/JUVv1kpjhKEKcQpm68l8/ol4z8AE/Ml+OiHMR+gk6jDAaBJkISmrwDmQBKMQb4NL60UI8nrTQHIPbnzIGXTrAqOoYzjrKscCfVtgYwAyPvHO1UMo90HvNHVj2hyOqIp5CfTXSr4YQQA3v7oHsDAHkAMAD48jjoHECN7BKG/ehrF3SPo2yMocU9fH7tHMLRHEPqe8a9vnSNo80UCfcr9l4fuEbT4JoFOxcNaAQYqgJ3yigzygmZEGS60+2jAFdjDBT2HZCXBMVxtWWKSF7QWnvu8fGu8CHQSvvu8Qnu8oHFQthSljZfF6X4/Wx3xCtznZW++l6RUBu7zai1tegZ5QQsQOs+rvRRskhcU/JHzvNp6wigwqO/3q28qiDUZy4+SD74Kgr5FghLF/x+SX+AaDUfxGF0ceN71ubzzYf1UpQoxyhTagv2CnMPj2OqLAhoD7L4zsPmq8KA1wO57g3aIDQwCg95AXZ7amBgxCQyaA+y+OwBqxCQxaA+w+/4AqA+TxKBBwO47BKAtTBKDFgG77xGsTvzQI+y/jcvEbM780BN0IA3QCjFZxYw2YJI8gPuCP7AIDOp9dZkAbXm5trYwScyHer8LuQDfIjEo+DuQDWhrC6PEoOLvQj7A4sTvQ8XfhYyAxZnfh4q/AzmBdogZLGHxoeDvQFKgHWEmgUlqftzX+0BbmCSmsepHnxhrSwuTwDTW/egD1lYWJoFpLPzRV4ZncdanUO4rU/v6gFmc9anG0h9ThZ4mS1ko1PrKpL42Xu34MslLY+mPuQULk8A01v6YExUmgWks/jEnKkwC01n8Y05VmCSmptjHtqzQR0zsvv8GSv3DAsc/kfIX'),

			this.addEntry(dt + 'text field', function()
	   		{
			   	var item1 = new mxCell('Your name', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('Sally Lu', new mxGeometry(0, 25, 290, 33), 'rounded=1;arcSize=9;fillColor=#F7F8F9;align=left;spacingLeft=5;strokeColor=#DEE1E6;html=1;strokeWidth=2;fontColor=#596780;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 58, 'Text field');
			}),
			this.addEntry(dt + 'text field required', function()
	   		{
			   	var item1 = new mxCell('Requirements<sup><font color="#ff0000">*</font></sup>', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('Design, eating, drinking', new mxGeometry(0, 25, 290, 33), 'rounded=1;arcSize=9;fillColor=#F7F8F9;align=left;spacingLeft=5;strokeColor=#DEE1E6;html=1;strokeWidth=2;fontColor=#596780;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 58, 'Text field with required fields');
			}),
			this.addEntry(dt + 'disabled text field', function()
	   		{
			   	var item1 = new mxCell('Guests', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#B3BAC5;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('Kris Wesley', new mxGeometry(0, 25, 290, 33), 'rounded=1;arcSize=9;fillColor=#F7F8F9;align=left;spacingLeft=5;strokeColor=#DEE1E6;html=1;strokeWidth=2;fontColor=#B3BAC5;fontSize=12');
			   	item2.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 58, 'Disabled text field');
			}),
			this.addDataEntry(dt + 'text field disabled', 370, 543, 'Disabled text field',
				'7VnLctowFP0ab7rI+MVrmRicRdNOpkmna8W+YDWy5MoihH59JVkQbBlCgiHJNMxg63Wv8Tn3JeEEUf54yVGRfWMpECeYOEHEGRNVK3+MgBDHd3HqBGPH9135dfx4y6ynZ90CcaBiHwG/EnhAZA7VSMQBCZBjSCni7DckolpUiiUxi6aYkIgRxmWXMipHL0rB2T00BjORy1cae7I5ZVTc4L9KgbfuG42u7COCZ1S2CUyFmV4pc/zAG/gXYdQQa6odyr55H+ACHrdioocMIJfAchB8KZcscCoyg0tY4eZmgGeZETNYuqis+rO16BPCsmFAbgc8sAC/rjAulWKugF9koO9LNufyxqFgJRaMY1BrCH6AM3m/zWC5FkkkCghT4GUlp4YQldcZZ/NCcYdzTFCLOqxWTZmauQMhgGttqVLK+AxRXCKBGS3P9rGBBoetJtEg1tWfBpF+3XQWGRZwU6BETS6kr8gxxTBOEDk3jxSsOJD9pSG5V0lsGEMwaDGGsHe4MYTbjEEOUpRLEvpEA6k47M+EfsNqSMGlqVoh2f8zZ9WCYDrVmG4MVbJfVsLyd1XydZ1yuPakt3b63qg/GLrPOL3XDe0rik8RA3oW7b/k78yBMGqBLv2XppCaF0c8Me89UjBsEKJpV58WN5Seg+nsSvfGPYs2KRpGo/M4rnNXLfpl8PBf4Lod0DGyvdAftXlhB3T0LTq+qtD66Xoncj0vbCH7WL43sMi+mNye7wRcwhFFE1f7x0tRX6GcSCxkbrVwXjveczjX48AhqD+u8pxBcwcLxyJhaJFwI1CZHRL84kE8jEevCn7jycSb9F8Y/OoO0m3w89qS0bGi38jiYgxlwnGhyr7/KxCtbfsUgchz7SogQyqxYF2X5wXjAulMU5XnBbCCqLpcMHm5p2zhBPHeLhO+Y5c5Xi3fEtOCfguhntdBNe95O8r5AniOy1Jtpd7eqfbaTYfdcBAMT+lU9nnGz1LvaVGSQPleoT9SHgndU0Jvn2z8AJQqrVRdFxyrY6UG/mWGCtWUunBRwo5NjRWDXLc3GA+twBPu2Kg0qGnGnRynKYE9uCHoDsi1OkZROTIY8wrKtcKrxvxacT20em43pdwq8KxoD2zavbag1wXr9hGGYZ1RstyD7nq+amYoN/bj9gQ0HEeT4INRvZksM5SqBK6fmcraV0PQlT3UK/uw12IPfos9+B3Yg3228V1F0E9DeA+G0LKvOJoh2Kcq1/M7gp/d5TWYb0T53YfJ1gnYetv9KtrDU1BluOl5NjdtlWoQdMCNfQgSIZoAeXV5tK3S/0A8GIFB3WWOSIvsPv3Pp+dqfwP+Aw=='),

			this.addEntry(dt + 'error message field', function()
	   		{
			   	var item1 = new mxCell('Email', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('shrugg#atlassian.com', new mxGeometry(0, 25, 300, 40), 'rounded=1;arcSize=9;align=left;spacingLeft=5;strokeColor=#FFAB00;html=1;strokeWidth=2;fontSize=12');
			   	item2.vertex = true;
			   	var item3 = new mxCell('', new mxGeometry(1, 0.5, 20, 20), 'shape=mxgraph.azure.azure_alert;fillColor=#FFAB00;strokeColor=none;html=1;sketch=0;');
			   	item3.geometry.relative = true;
			   	item3.geometry.offset = new mxPoint(-30, -10);
			   	item3.vertex = true;
			   	item2.insert(item3);
		   		return sb.createVertexTemplateFromCells([item1, item2], 290, 58, 'Error message field');
			}),
			this.addEntry(dt + 'error message field', function()
	   		{
			   	var item1 = new mxCell('Email', new mxGeometry(0, 0, 240, 20), 'fillColor=none;strokeColor=none;html=1;fontSize=11;fontStyle=0;align=left;fontColor=#596780;fontStyle=1;fontSize=11');
			   	item1.vertex = true;
			   	var item2 = new mxCell('shrugg#atlassian.com', new mxGeometry(0, 25, 300, 40), 'rounded=1;arcSize=9;align=left;spacingLeft=5;strokeColor=#4C9AFF;html=1;strokeWidth=2;fontSize=12');
			   	item2.vertex = true;
			   	var item3 = new mxCell('', new mxGeometry(1, 0.5, 20, 20), 'shape=mxgraph.azure.azure_alert;fillColor=#FFAB00;strokeColor=none;html=1;sketch=0;');
			   	item3.geometry.relative = true;
			   	item3.geometry.offset = new mxPoint(-30, -10);
			   	item3.vertex = true;
			   	item2.insert(item3);
			   	var item4 = new mxCell('Please enter a valid address.', new mxGeometry(310, 22, 200, 46), 'rounded=1;arcSize=9;align=center;strokeColor=#DFE1E5;html=1;strokeWidth=1;fontSize=12;shadow=1');
			   	item4.vertex = true;
		   		return sb.createVertexTemplateFromCells([item1, item2, item4], 510, 68, 'Error message field');
			})
		];
			   	
   		this.addPalette('atlassian', 'Atlassian', false, mxUtils.bind(this, function(content)
	    {
			for (var i = 0; i < fns.length; i++)
			{
				content.appendChild(fns[i](content));
			}
		}));
   		
		this.setCurrentSearchEntryLibrary();
	};
})();
