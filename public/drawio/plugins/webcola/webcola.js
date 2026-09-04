/**
 * Copyright (c) 2020-2025, JGraph Holdings Ltd
 * Copyright (c) 2020-2025, draw.io AG
 */
/**
 * WebCola layout plugin.
 *
 * @deprecated Prefer the built-in ELK layouts (Arrange > Layout). The
 * upstream cola.js library has been in maintenance mode since ~2021 and
 * ELK's `elkStress` (stress majorization) and `elkOrganic` (force-directed)
 * algorithms cover the same use cases that this plugin exposes through its
 * single menu entry. `elkDisco` handles disconnected components.
 *
 * Plugin contents (~120 KB / 1365 LOC total):
 *   - cola.min.js          — upstream WebCola library (last touched Mar 2021)
 *   - mxWebColaAdaptor.js  — mxGraph ↔ cola bridge (908 LOC)
 *   - mxWebColaLayout.js   — mxGraphLayout wrapper (410 LOC)
 *   - webcola.js           — this file: plugin registration
 *
 * What WebCola still does that ELK does not:
 *   1. Constraint solver — gap inequalities, alignment constraints, flow
 *      constraints, two-pass "user constraints then non-overlap" iteration.
 *      ELK's stress/force are unconstrained beyond basic spacing.
 *   2. Live animation during simulation (ELK is one-shot).
 *   3. Group/cluster handling tuned for the constraint model.
 *
 * None of those are surfaced in the current UI — the menu entry just runs
 * the layout with defaults — so retiring this plugin in favor of `elkStress`
 * would be transparent for almost all users. Keep it only if/when we want
 * to build a constraint-editing UI on top of it.
 */
Draw.loadPlugin(function(ui)
{
	mxscript("plugins/webcola/cola.min.js", null, null, null, true);
	mxscript("plugins/webcola/mxWebColaAdaptor.js", null, null, null, true);
	mxscript("plugins/webcola/mxWebColaLayout.js", null, null, null, true);
	
	// Adds resource for action
	mxResources.parse('webColaLayout=WebCola Layout...');

	// Adds action
	ui.actions.addAction('webColaLayout', function()
	{
		// TODO: set mxWebColaAdaptor's doAnimations to the value of editorUi.allowAnimation
		// TODO: don't record all animation steps as undo states
		var graph = ui.editor.graph;
		var layout = new mxWebColaLayout(graph);
		var parent = graph.getDefaultParent(); 
		layout.execute(parent);
	});
	
	var menu = ui.menus.get('layout');
	
	if (menu != null)
	{
		var oldFunct = menu.funct;
		
		menu.funct = function(menu, parent)
		{
			oldFunct.apply(this, arguments);
			
			if (typeof window.mxWebColaLayout === 'function')
			{
				ui.menus.addMenuItems(menu, ['-', 'webColaLayout'], parent);
			}
		};
	}
});
