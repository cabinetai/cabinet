// Sets page size and margins
#set page(
  paper: "a4",
  margin: (x: 2.5cm, y: 3cm),
)

// Sets the base font and size
#set text(
  font: "Liberation Sans",
  size: 11pt,
)

// Title and Author information
#align(center)[
  #text(size: 22pt, weight: "bold")[My First Typst Document]
  
  #v(1em)
  Jane Doe \
  June 21, 2026
]

#v(2em)

// Main content starts here
== Introduction
This is a simple example of a `.typ` file. Typst is a markup-based typesetting system that is as powerful as LaTeX but much easier to learn.

=== Creating Lists
Here is how you write bullet points:
- First item
- Second item
- Third item

=== Math
Typst handles math natively. For example, the quadratic formula is expressed as:
$ x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a} $

== Conclusion
You can easily build this into a beautiful PDF using the open-source CLI or the collaborative [Typst Web App](https://typst.app/).
