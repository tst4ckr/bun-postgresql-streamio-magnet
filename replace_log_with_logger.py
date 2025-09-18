#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para reemplazar todas las ocurrencias de #log por #logger en el proyecto
Para implementar el EnhancedLogger en todo el codebase.

Uso:
    python replace_log_with_logger.py
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Tuple


class LogToLoggerReplacer:
    """Reemplaza #log por #logger en archivos JavaScript del proyecto."""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.files_processed = 0
        self.replacements_made = 0
        self.backup_dir = self.project_root / "backups_log_replacement"
        
        # Patrones de reemplazo
        self.patterns = [
            # Llamadas a métodos: this.#log('level', 'message')
            (r'this\.#log\(', 'this.#logger('),
            # Definiciones de métodos: #log(level, message) {
            (r'#log\(([^)]+)\)\s*{', r'#logger(\1) {'),
            # Referencias directas: #log
            (r'(?<!#logger)(?<!this\.)#log(?!ger)(?=\s|\(|$)', '#logger')
        ]
    
    def create_backup_dir(self) -> None:
        """Crea directorio de respaldo si no existe."""
        if not self.backup_dir.exists():
            self.backup_dir.mkdir(parents=True, exist_ok=True)
            print(f"✓ Directorio de respaldo creado: {self.backup_dir}")
    
    def backup_file(self, file_path: Path) -> None:
        """Crea respaldo del archivo original."""
        relative_path = file_path.relative_to(self.project_root)
        backup_path = self.backup_dir / relative_path
        
        # Crear directorios padre si no existen
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Copiar archivo original
        with open(file_path, 'r', encoding='utf-8') as src:
            content = src.read()
        
        with open(backup_path, 'w', encoding='utf-8') as dst:
            dst.write(content)
    
    def find_js_files(self) -> List[Path]:
        """Encuentra todos los archivos JavaScript en el proyecto."""
        js_files = []
        
        # Buscar en directorio src principalmente
        src_dir = self.project_root / "src"
        if src_dir.exists():
            js_files.extend(src_dir.rglob("*.js"))
        
        # También buscar en raíz del proyecto
        for file_path in self.project_root.glob("*.js"):
            if file_path.is_file():
                js_files.append(file_path)
        
        # Filtrar archivos que no queremos modificar
        excluded_patterns = [
            'node_modules',
            '.git',
            'dist',
            'build',
            'coverage',
            'EnhancedLogger.js'  # No modificar el logger mismo
        ]
        
        filtered_files = []
        for file_path in js_files:
            if not any(pattern in str(file_path) for pattern in excluded_patterns):
                filtered_files.append(file_path)
        
        return filtered_files
    
    def process_file(self, file_path: Path) -> Tuple[bool, int]:
        """Procesa un archivo individual.
        
        Returns:
            Tuple[bool, int]: (archivo_modificado, numero_reemplazos)
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original_content = content
            replacements_in_file = 0
            
            # Aplicar cada patrón de reemplazo
            for pattern, replacement in self.patterns:
                new_content, count = re.subn(pattern, replacement, content)
                if count > 0:
                    content = new_content
                    replacements_in_file += count
            
            # Si hubo cambios, crear respaldo y escribir archivo
            if content != original_content:
                self.backup_file(file_path)
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                return True, replacements_in_file
            
            return False, 0
            
        except Exception as e:
            print(f"❌ Error procesando {file_path}: {e}")
            return False, 0
    
    def run(self) -> None:
        """Ejecuta el proceso de reemplazo."""
        print("🔄 Iniciando reemplazo de #log por #logger...")
        print(f"📁 Directorio del proyecto: {self.project_root}")
        
        # Crear directorio de respaldo
        self.create_backup_dir()
        
        # Encontrar archivos JavaScript
        js_files = self.find_js_files()
        print(f"📄 Encontrados {len(js_files)} archivos JavaScript")
        
        if not js_files:
            print("⚠️  No se encontraron archivos JavaScript para procesar")
            return
        
        # Procesar cada archivo
        modified_files = []
        
        for file_path in js_files:
            was_modified, replacements = self.process_file(file_path)
            
            if was_modified:
                modified_files.append(file_path)
                self.replacements_made += replacements
                relative_path = file_path.relative_to(self.project_root)
                print(f"✓ {relative_path}: {replacements} reemplazos")
            
            self.files_processed += 1
        
        # Resumen final
        print("\n" + "="*60)
        print("📊 RESUMEN DEL PROCESO")
        print("="*60)
        print(f"📄 Archivos procesados: {self.files_processed}")
        print(f"✏️  Archivos modificados: {len(modified_files)}")
        print(f"🔄 Total de reemplazos: {self.replacements_made}")
        print(f"💾 Respaldos guardados en: {self.backup_dir}")
        
        if modified_files:
            print("\n📝 Archivos modificados:")
            for file_path in modified_files:
                relative_path = file_path.relative_to(self.project_root)
                print(f"   • {relative_path}")
            
            print("\n✅ Proceso completado exitosamente")
            print("\n⚠️  IMPORTANTE:")
            print("   • Revisa los cambios antes de hacer commit")
            print("   • Ejecuta las pruebas para verificar que todo funciona")
            print("   • Los respaldos están disponibles en caso de necesitar revertir")
        else:
            print("\n✅ No se encontraron ocurrencias de #log para reemplazar")


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
    
    # Ejecutar reemplazador
    replacer = LogToLoggerReplacer(project_root)
    replacer.run()


if __name__ == "__main__":
    main()