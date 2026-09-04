/**
 * Copyright (c) 2020-2025, JGraph Holdings Ltd
 * Copyright (c) 2020-2025, draw.io AG
 */
/**
 * Anonymize plugin.
 */
Draw.loadPlugin(function(editorUi)
{
	mxResources.parse('anonymizeCurrentPage=Anonymize Current Page');

	editorUi.actions.addAction('anonymizeCurrentPage', function()
	{
		var graph = editorUi.editor.graph;
		var snapshot = editorUi.getDiagramSnapshot();
		var anonymized = editorUi.anonymizeXml(mxUtils.getXml(snapshot.node));
		var newNode = mxUtils.parseXml(anonymized).documentElement;

		graph.model.beginUpdate();
		try
		{
			editorUi.updateDiagramData(snapshot, newNode);

			if (editorUi.currentPage != null)
			{
				graph.model.execute(new RenamePage(editorUi, editorUi.currentPage,
					editorUi.anonymizeString(editorUi.currentPage.getName())));
			}
		}
		finally
		{
			graph.model.endUpdate();
		}
	});

	var menu = editorUi.menus.get('extras');
	var oldFunct = menu.funct;

	menu.funct = function(menu, parent)
	{
		oldFunct.apply(this, arguments);

		editorUi.menus.addMenuItems(menu, ['-', 'anonymizeCurrentPage'], parent);
	};
});
