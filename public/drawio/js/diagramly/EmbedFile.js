/**
 * Copyright (c) 2020, JGraph Holdings Ltd
 * Copyright (c) 2020, draw.io AG
 */
EmbedFile = function(ui, data, desc)
{
	DrawioFile.call(this, ui, data);
	
	this.desc = desc || {};
	this.mode = App.MODE_EMBED;
};

//Extends DrawioFile
mxUtils.extend(EmbedFile, DrawioFile);

EmbedFile.prototype.getMode = function()
{
	return this.mode;
};

EmbedFile.prototype.getDescriptor = function()
{
	return this.desc;
};

EmbedFile.prototype.setDescriptor = function(desc)
{
	this.desc = desc || {};
};

EmbedFile.prototype.getTitle = function()
{
	return this.desc.title || '';
};

//This class need to be implemented by integrations if some file features like real-time collaboration is needed
