/**
 * Copyright (c) 2006-2017, JGraph Holdings Ltd
 * Copyright (c) 2006-2017, draw.io AG
 */
OneDriveLibrary = function(ui, data, meta, isSP)
{
	OneDriveFile.call(this, ui, data, meta, isSP);
};

//Extends mxEventSource
mxUtils.extend(OneDriveLibrary, OneDriveFile);

/**
 * Translates this point by the given vector.
 * 
 * @param {number} dx X-coordinate of the translation.
 * @param {number} dy Y-coordinate of the translation.
 */
OneDriveLibrary.prototype.isAutosave = function()
{
	return true;
};

/**
 * Translates this point by the given vector.
 * 
 * @param {number} dx X-coordinate of the translation.
 * @param {number} dy Y-coordinate of the translation.
 */
OneDriveLibrary.prototype.save = function(revision, success, error)
{
	(this.isSP? this.ui.m365 : this.ui.oneDrive).saveFile(this, mxUtils.bind(this, function(resp)
	{
		this.desc = resp;
		
		if (success != null)
		{
			success(resp);
		}
	}), error);
};

/**
 * Returns the location as a new object.
 * @type mx.Point
 */
OneDriveLibrary.prototype.open = function()
{
	// Do nothing - this should never be called
};
