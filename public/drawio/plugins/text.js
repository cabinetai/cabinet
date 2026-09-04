/**
 * Copyright (c) 2020-2025, JGraph Holdings Ltd
 * Copyright (c) 2020-2025, draw.io AG
 */
/**
 * Text extraction plugin.
 */
Draw.loadPlugin(function(ui)
{
	var menu = ui.menus.get('extras');
	var oldFunct = menu.funct;

	menu.funct = function(menu, parent)
	{
		oldFunct.apply(this, arguments);

		ui.menus.addMenuItems(menu, ['-', 'extractText'], parent);
	};
});
