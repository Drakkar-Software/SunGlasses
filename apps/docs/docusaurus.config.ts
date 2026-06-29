import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "SunGlasses",
  tagline:
    "Privacy-first event tracking for Expo / React Native and web apps — with built-in PII sanitization and opt-out-by-default consent.",
  favicon: "img/logo.png",

  future: {
    v4: true,
  },

  url: "https://drakkar-software.github.io",
  baseUrl: "/SunGlasses/",

  organizationName: "Drakkar-Software",
  projectName: "SunGlasses",
  trailingSlash: false,

  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",

  markdown: {
    format: "detect",
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    [
      "docusaurus-plugin-llms-txt",
      {
        title: "SunGlasses",
        description:
          "Privacy-first event tracking library for React and React Native / Expo. Built-in PII sanitization, opt-out-by-default consent, pluggable storage and output adapters.",
        fullLLMsTxt: true,
      },
    ],
  ],

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/Drakkar-Software/SunGlasses/edit/main/website/docs/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "SunGlasses",
      logo: {
        alt: "SunGlasses",
        src: "img/logo.png",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "mainSidebar",
          position: "left",
          label: "Docs",
        },
        {
          href: "https://github.com/Drakkar-Software/SunGlasses",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Getting Started",
          items: [
            { label: "Introduction", to: "/getting-started/intro" },
            { label: "Web Setup", to: "/getting-started/web-setup" },
            { label: "React Native Setup", to: "/getting-started/react-native-setup" },
          ],
        },
        {
          title: "Guides",
          items: [
            { label: "Consent", to: "/privacy/consent" },
            { label: "Error Capture", to: "/guides/error-capture" },
            { label: "Ingest Server", to: "/backend/ingest-server" },
            { label: "Analytics Dashboard", to: "/backend/analytics-dashboard" },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/Drakkar-Software/SunGlasses",
            },
            {
              label: "npm",
              href: "https://www.npmjs.com/package/@drakkar.software/sunglasses-core",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Drakkar Software. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "typescript"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
