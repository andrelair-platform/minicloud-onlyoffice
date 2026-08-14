import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'minicloud OnlyOffice',
  tagline: 'Custom DocumentServer image with minicloud CA cert',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://andrelair-platform.github.io',
  baseUrl: '/minicloud-onlyoffice/',
  organizationName: 'andrelair-platform',
  projectName: 'minicloud-onlyoffice',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'minicloud OnlyOffice',
      items: [
        {
          href: 'https://andrelair-platform.github.io/minicloud-platform-docs/',
          label: 'Platform Docs',
          position: 'right',
        },
        {
          href: 'https://github.com/andrelair-platform/minicloud-onlyoffice',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          label: 'Platform Docs',
          href: 'https://andrelair-platform.github.io/minicloud-platform-docs/',
        },
        {
          label: 'GitHub',
          href: 'https://github.com/andrelair-platform/minicloud-onlyoffice',
        },
      ],
      copyright: `minicloud platform — andrelair-platform`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml'],
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
