#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para corregir las llamadas a métodos #logger por #logMessage
Para evitar conflictos con la propiedad #logger.

Uso:
    python fix_logger_method_calls.py
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Tuple


class LoggerMethodCallFixer:
    """Corrige las llamadas a métodos #logger por #logMessage en archivos JavaScript."""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.files_processed = 0
        self.replacements_made = 0
        
        # Archivos específicos que sabemos fueron modificados
        self.target_files = [
            "src/infrastructure/services/TorrentioApiService.js",
            "src/infrastructure/repositories/CascadingMagnetRepository.js",
            "src/application/handlers/StreamHandler.js"
        ]
        
        # Patrón de reemplazo: this.#logger( -> this.#logMessage(
        self.pattern = r'this\.#logger\('
        self.replacement = 'this.#logMessage('
    
    def process_file(self, file_path: Path) -> Tuple[bool, int]:
        """Procesa un archivo individual.
        
        Returns:
            Tuple[bool, int]: (archivo_modificado, numero_reemplazos)
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original_content = content
            
            # Aplicar reemplazo
            new_content, count = re.subn(self.pattern, self.replacement, content)
            
            # Si hubo cambios, escribir archivo
            if count > 0:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                
                return True, count
            
            return False, 0
            
        except Exception as e:
            print(f"❌ Error procesando {file_path}: {e}")
            return False, 0
    
    def run(self) -> None:
        """Ejecuta el proceso de corrección."""
        print("🔧 Corrigiendo llamadas a métodos #logger...")
        print(f"📁 Directorio del proyecto: {self.project_root}")
        
        # Procesar archivos específicos
        modified_files = []
        
        for relative_path in self.target_files:
            file_path = self.project_root / relative_path
            
            if not file_path.exists():
                print(f"⚠️  Archivo no encontrado: {relative_path}")
                continue
            
            was_modified, replacements = self.process_file(file_path)
            
            if was_modified:
                modified_files.append(file_path)
                self.replacements_made += replacements
                print(f"✓ {relative_path}: {replacements} reemplazos")
            else:
                print(f"• {relative_path}: sin cambios")
            
            self.files_processed += 1
        
        # Resumen final
        print("\n" + "="*60)
        print("📊 RESUMEN DE LA CORRECCIÓN")
        print("="*60)
        print(f"📄 Archivos procesados: {self.files_processed}")
        print(f"✏️  Archivos modificados: {len(modified_files)}")
        print(f"🔄 Total de reemplazos: {self.replacements_made}")
        
        if modified_files:
            print("\n📝 Archivos corregidos:")
            for file_path in modified_files:
                relative_path = file_path.relative_to(self.project_root)
                print(f"   • {relative_path}")
            
            print("\n✅ Corrección completada exitosamente")
        else:
            print("\n✅ No se encontraron llamadas a #logger para corregir")


def main():
    """Función principal."""
    # Obtener directorio del proyecto
    if len(sys.argv) > 1:
        project_root = sys.argv[1]
    else:
        # Usar directorio actual como raíz del proyecto
        project_root = os.getcwd()
    
    # Verificar que existe el directorio
    if not os.path.isdir(project_root):
        print(f"❌ Error: El directorio {project_root} no existe")
        sys.exit(1)
    
    # Ejecutar corrector
    fixer = LoggerMethodCallFixer(project_root)
    fixer.run()


if __name__ == "__main__":
    main()