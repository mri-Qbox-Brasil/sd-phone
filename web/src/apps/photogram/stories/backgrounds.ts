export const STORY_BACKGROUNDS: Record<string, string> = {
    sunset: 'linear-gradient(150deg, #833AB4, #FD1D1D 55%, #FCB045)',
    ocean:  'linear-gradient(150deg, #0052D4, #4364F7 50%, #6FB1FC)',
    forest: 'linear-gradient(150deg, #0B8A6F, #38C976)',
    berry:  'linear-gradient(150deg, #C2187A, #FC6767)',
    night:  'linear-gradient(150deg, #1E1F22, #4A4C52)',
};

export const DEFAULT_STORY_BACKGROUND = 'sunset';

export function storyBackground(key: string | undefined): string {
    return STORY_BACKGROUNDS[key ?? ''] ?? STORY_BACKGROUNDS[DEFAULT_STORY_BACKGROUND];
}
