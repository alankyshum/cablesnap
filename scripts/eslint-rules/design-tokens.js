"use strict";

const SPACING_PROPERTIES = /^(padding(?:Top|Right|Bottom|Left|Horizontal|Vertical)?|margin(?:Top|Right|Bottom|Left|Horizontal|Vertical)?|gap|rowGap|columnGap)$/;
const COLOR_PROPERTIES = /(?:color|Color)$/;
const TOKEN_PROPERTIES = /^(borderRadius|fontSize)$/;
const SPACING_TOKENS = { xxs: 2, xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 };

function literalValue(node) {
  if (!node) return undefined;
  if (node.type === "Literal" && typeof node.value === "number") return node.value;
  if (node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "Literal" && typeof node.argument.value === "number") return -node.argument.value;
  if (node.type === "MemberExpression" && !node.computed && node.object.type === "Identifier" && node.object.name === "spacing" && node.property.type === "Identifier") {
    return SPACING_TOKENS[node.property.name];
  }
  return undefined;
}

module.exports = {
  meta: { type: "problem", docs: { description: "Keep React Native styles on design tokens and the 4px spacing grid." }, schema: [] },
  create(context) {
    const filename = context.getFilename();
    if (/[/\\]constants[/\\](design-tokens|theme)\.ts$/.test(filename)) return {};
    const report = (node, message) => context.report({ node, message });
    const isStyleValue = () => context.getAncestors().some((ancestor) =>
      (ancestor.type === "CallExpression" && ancestor.callee.type === "MemberExpression" &&
        ancestor.callee.object.type === "Identifier" && ancestor.callee.object.name === "StyleSheet" &&
        ancestor.callee.property.type === "Identifier" && ancestor.callee.property.name === "create") ||
      (ancestor.type === "JSXAttribute" && ancestor.name.type === "JSXIdentifier" && /style/i.test(ancestor.name.name)),
    );
    return {
      Property(node) {
        if (!isStyleValue()) return;
        const name = node.key && (node.key.name || node.key.value);
        if (typeof name !== "string") return;
        const value = literalValue(node.value);
        if (SPACING_PROPERTIES.test(name) && value !== undefined) {
          if (value % 4 !== 0) report(node.value, `Spacing property ${name} must be divisible by 4; actual value is ${value}.`);
          else if (node.value.type === "Literal") report(node.value, `Use a design-token spacing value for ${name}; actual value is ${value}.`);
        }
        if (TOKEN_PROPERTIES.test(name) && node.value.type === "Literal" && typeof node.value.value === "number") {
          report(node.value, `Use a design-token value for ${name}; actual value is ${node.value.value}.`);
        }
        if (COLOR_PROPERTIES.test(name) && node.value.type === "Literal" && typeof node.value.value === "string" && /^#[0-9a-f]{3,8}$/i.test(node.value.value)) {
          report(node.value, `Use useThemeColors() design tokens instead of hardcoded hex color ${node.value.value}.`);
        }
      },
    };
  },
};
