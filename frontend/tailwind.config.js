module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#EEF1E6',
        surface: '#FFFFFF',
        ink: '#1E2A1F',
        primary: '#2F4A37',
        primarylight: '#4C7057',
        accent: '#C68A2E',
        alert: '#A6432B',
        line: '#D8DED0'
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body: ['IBM Plex Sans', 'sans-serif']
      },
      borderRadius: {
        sm: '4px',
        md: '8px'
      }
    }
  },
  plugins: []
}
