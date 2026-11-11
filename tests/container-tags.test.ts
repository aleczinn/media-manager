import { describe, expect, it } from 'vitest'
import { describeContainerTags } from '../src/shared/container-tags'

describe('describeContainerTags', () => {
    it('zeigt bekannte Tags auf Deutsch in fester Reihenfolge, übrige danach', () => {
        // So liest die Analyse die Tags einer Big-Time-Rush-Folge (Schlüssel kleingeschrieben)
        const tags = {
            title: 'Willkommen zurück, Big Time Rush',
            season_number: '2',
            date: '2010',
            description: 'Zum Beginn der zweiten Staffel …',
            show: 'Big Time Rush',
            episode_id: '1',
            encoder: 'Lavf60.3.100',
            custom_tag: 'x'
        }
        expect(describeContainerTags(tags).map((tag) => [tag.label, tag.value])).toEqual([
            ['Titel', 'Willkommen zurück, Big Time Rush'],
            ['Serie', 'Big Time Rush'],
            ['Staffel', '2'],
            ['Episode', '1'],
            ['Datum', '2010'],
            ['Beschreibung', 'Zum Beginn der zweiten Staffel …'],
            ['Encoder', 'Lavf60.3.100'],
            ['custom_tag', 'x']
        ])
    })

    it('blendet technische MP4-Angaben und doppelte Texte aus', () => {
        const tags = { major_brand: 'isom', compatible_brands: 'isomiso2', description: 'Text', comment: 'Text', synopsis: 'Text' }
        expect(describeContainerTags(tags)).toEqual([{ key: 'description', label: 'Beschreibung', value: 'Text' }])
    })

    it('formatiert das Erstelldatum, ohne Tags gibt es nichts', () => {
        const [created] = describeContainerTags({ creation_time: '2025-04-08T17:42:02.000000Z' })
        expect(created.value).toMatch(/^08\.04\.2025, \d{2}:42$/)
        expect(describeContainerTags(undefined)).toEqual([])
    })
})
