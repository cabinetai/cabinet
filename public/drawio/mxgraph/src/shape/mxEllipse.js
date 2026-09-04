/**
 * Copyright (c) 2006-2015, JGraph Holdings Ltd
 * Copyright (c) 2006-2015, draw.io AG
 */
/**
 * Class: mxEllipse
 *
 * Extends <mxShape> to implement an ellipse shape.
 * This shape is registered under <mxConstants.SHAPE_ELLIPSE>
 * in <mxCellRenderer>.
 * 
 * Constructor: mxEllipse
 *
 * Constructs a new ellipse shape.
 * 
 * Parameters:
 * 
 * bounds - <mxRectangle> that defines the bounds. This is stored in
 * <mxShape.bounds>.
 * fill - String that defines the fill color. This is stored in <fill>.
 * stroke - String that defines the stroke color. This is stored in <stroke>.
 * strokewidth - Optional integer that defines the stroke width. Default is
 * 1. This is stored in <strokewidth>.
 */
function mxEllipse(bounds, fill, stroke, strokewidth)
{
	mxShape.call(this);
	this.bounds = bounds;
	this.fill = fill;
	this.stroke = stroke;
	this.strokewidth = (strokewidth != null) ? strokewidth : 1;
};

/**
 * Extends mxShape.
 */
mxUtils.extend(mxEllipse, mxShape);

/**
 * Function: paintVertexShape
 *
 * Paints the ellipse shape.
 */
mxEllipse.prototype.paintVertexShape = function(c, x, y, w, h)
{
	c.ellipse(x, y, w, h);
	c.fillAndStroke();

	// Guarded because other shapes borrow this painter via
	// mxEllipse.prototype.paintVertexShape.apply(this, ...) with a
	// non-ellipse `this` (e.g. the UML actor head in Shapes.js)
	if (this.paintCenter != null)
	{
		this.paintCenter(c, x, y, w, h);
	}
};

/**
 * Function: paintCenter
 *
 * Paints the optional filled circle at the center of the ellipse (see
 * <mxConstants.STYLE_CENTER_RADIUS>), e.g. for UML final states. The radius
 * is clamped to the ellipse extent and the circle is filled with
 * <mxConstants.STYLE_CENTER_COLOR> (default is the stroke color).
 *
 * When `centerStroke=1` is set the inner circle is additionally outlined in
 * the shape's own stroke color (default is fill-only).
 */
mxEllipse.prototype.paintCenter = function(c, x, y, w, h)
{
	if (this.style == null || this.outline)
	{
		return;
	}

	var r = Math.min(Math.max(0, mxUtils.getValue(this.style,
		mxConstants.STYLE_CENTER_RADIUS, 0)), w / 2, h / 2);

	if (r > 0)
	{
		var color = mxUtils.getValue(this.style,
			mxConstants.STYLE_CENTER_COLOR, this.stroke);

		if (color != null && color != mxConstants.NONE)
		{
			c.setShadow(false);
			c.setFillColor(color);
			c.ellipse(x + w / 2 - r, y + h / 2 - r, 2 * r, 2 * r);

			// Optional border on the inner circle, drawn in the shape's own
			// stroke color (centerStroke=1). Default stays fill-only.
			if (mxUtils.getValue(this.style, 'centerStroke', 0) == 1 &&
				this.stroke != null && this.stroke != mxConstants.NONE)
			{
				c.setStrokeColor(this.stroke);
				c.fillAndStroke();
			}
			else
			{
				c.fill();
			}
		}
	}
};
